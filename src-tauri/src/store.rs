use std::sync::Mutex;

use serde::{Deserialize, Serialize};
use serde_json::{Map, Value};
use tauri::AppHandle;
use tauri_plugin_store::StoreExt;

const STORE_PATH: &str = "settings.json";
const MAX_ENTRY_KEY_BYTES: usize = 256;
const MAX_VALUE_BYTES: usize = 2 * 1024 * 1024;
const MAX_STRING_ITEMS: usize = 10_000;
const MAX_STRING_BYTES: usize = 4 * 1024;
static STORE_MUTATION: Mutex<()> = Mutex::new(());

#[derive(Deserialize, Serialize)]
#[serde(tag = "type", rename_all = "camelCase")]
pub enum ScopedStoreMutation {
    Set { value: Value },
    AddString { value: String },
    RemoveString { value: String },
    ClearStrings,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ScopedStoreRequest {
    key: String,
    entry_key: String,
    mutation: ScopedStoreMutation,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ScopedStoreResponse {
    value: Value,
}

#[derive(Deserialize, Serialize)]
#[serde(tag = "type", rename_all = "camelCase")]
pub enum ArrayStoreMutation {
    AppendUnique {
        value: Value,
        identity: Map<String, Value>,
        limit: Option<usize>,
        sort_field: Option<String>,
    },
    RemoveMatching {
        identity: Map<String, Value>,
    },
    Clear,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ArrayStoreRequest {
    key: String,
    mutation: ArrayStoreMutation,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SettingsPatchRequest {
    values: Map<String, Value>,
    expected: Option<Map<String, Value>>,
}

fn validate_request(request: &ScopedStoreRequest) -> Result<(), String> {
    if !matches!(
        request.key.as_str(),
        "categoryConfig" | "categoryLastActivity" | "hiddenRecentTasksByConnection"
    ) {
        return Err("Scoped store key is not allowed".into());
    }
    if request.entry_key.is_empty() || request.entry_key.len() > MAX_ENTRY_KEY_BYTES {
        return Err("Invalid scoped store entry key".into());
    }
    if serde_json::to_vec(&request.mutation)
        .map_err(|_| "Invalid scoped store value".to_string())?
        .len()
        > MAX_VALUE_BYTES
    {
        return Err("Scoped store value is too large".into());
    }
    Ok(())
}

fn string_items(value: Option<&Value>) -> Result<Vec<String>, String> {
    match value {
        None => Ok(Vec::new()),
        Some(Value::Array(items)) => items
            .iter()
            .map(|item| {
                item.as_str()
                    .filter(|text| text.len() <= MAX_STRING_BYTES)
                    .map(str::to_owned)
                    .ok_or_else(|| "Scoped store entry is not a string array".to_string())
            })
            .collect(),
        Some(_) => Err("Scoped store entry is not a string array".into()),
    }
}

fn apply_mutation(
    map: &mut Map<String, Value>,
    entry_key: &str,
    mutation: ScopedStoreMutation,
) -> Result<Value, String> {
    let next = match mutation {
        ScopedStoreMutation::Set { value } => value,
        ScopedStoreMutation::AddString { value } => {
            if value.len() > MAX_STRING_BYTES {
                return Err("Scoped store string is too long".into());
            }
            let mut items = string_items(map.get(entry_key))?;
            if !items.iter().any(|item| item == &value) {
                if items.len() >= MAX_STRING_ITEMS {
                    return Err("Scoped store string array is too large".into());
                }
                items.push(value);
            }
            serde_json::to_value(items).map_err(|e| e.to_string())?
        }
        ScopedStoreMutation::RemoveString { value } => {
            let mut items = string_items(map.get(entry_key))?;
            items.retain(|item| item != &value);
            serde_json::to_value(items).map_err(|e| e.to_string())?
        }
        ScopedStoreMutation::ClearStrings => Value::Array(Vec::new()),
    };
    map.insert(entry_key.to_string(), next.clone());
    Ok(next)
}

fn matches_identity(value: &Value, identity: &Map<String, Value>) -> bool {
    let Some(object) = value.as_object() else {
        return false;
    };
    identity
        .iter()
        .all(|(key, expected)| object.get(key) == Some(expected))
}

fn apply_array_mutation(
    items: &mut Vec<Value>,
    mutation: ArrayStoreMutation,
) -> Result<(), String> {
    match mutation {
        ArrayStoreMutation::AppendUnique {
            value,
            identity,
            limit,
            sort_field,
        } => {
            if !value.is_object() || identity.is_empty() {
                return Err("Invalid array store object mutation".into());
            }
            if !items.iter().any(|item| matches_identity(item, &identity)) {
                items.push(value);
            }
            if let Some(limit) = limit {
                if limit == 0 || limit > MAX_STRING_ITEMS {
                    return Err("Invalid array store limit".into());
                }
                if items.len() > limit {
                    if let Some(field) = sort_field {
                        items.sort_by(|left, right| {
                            let left = left
                                .as_object()
                                .and_then(|object| object.get(&field))
                                .and_then(Value::as_str)
                                .unwrap_or("");
                            let right = right
                                .as_object()
                                .and_then(|object| object.get(&field))
                                .and_then(Value::as_str)
                                .unwrap_or("");
                            left.cmp(right)
                        });
                    }
                    items.drain(0..items.len() - limit);
                }
            }
        }
        ArrayStoreMutation::RemoveMatching { identity } => {
            if identity.is_empty() {
                return Err("Array store identity is required".into());
            }
            items.retain(|item| !matches_identity(item, &identity));
        }
        ArrayStoreMutation::Clear => items.clear(),
    }
    Ok(())
}

fn apply_settings_patch(
    settings: &mut Map<String, Value>,
    values: Map<String, Value>,
    expected: Option<&Map<String, Value>>,
) -> Result<(), String> {
    if expected.is_some_and(|expected| {
        expected
            .iter()
            .any(|(key, value)| settings.get(key) != Some(value))
    }) {
        return Err("Settings changed before the patch could be applied".into());
    }
    settings.extend(values);
    Ok(())
}

#[tauri::command]
pub fn mutate_scoped_store(
    app: AppHandle,
    request: ScopedStoreRequest,
) -> Result<ScopedStoreResponse, String> {
    validate_request(&request)?;
    let _transaction = STORE_MUTATION
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner());
    let store = app.store(STORE_PATH).map_err(|e| e.to_string())?;
    let mut map = match store.get(&request.key) {
        Some(Value::Object(map)) => map,
        None => Map::new(),
        Some(_) => return Err("Scoped store value is not an object".into()),
    };
    let value = apply_mutation(&mut map, &request.entry_key, request.mutation)?;
    store.set(request.key, Value::Object(map));
    store.save().map_err(|e| e.to_string())?;
    Ok(ScopedStoreResponse { value })
}

#[tauri::command]
pub fn mutate_array_store(
    app: AppHandle,
    request: ArrayStoreRequest,
) -> Result<ScopedStoreResponse, String> {
    if !matches!(request.key.as_str(), "favoriteTasks" | "pausedTimers") {
        return Err("Array store key is not allowed".into());
    }
    if serde_json::to_vec(&request.mutation)
        .map_err(|_| "Invalid array store mutation".to_string())?
        .len()
        > MAX_VALUE_BYTES
    {
        return Err("Array store mutation is too large".into());
    }
    let _transaction = STORE_MUTATION
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner());
    let store = app.store(STORE_PATH).map_err(|e| e.to_string())?;
    let mut items = match store.get(&request.key) {
        Some(Value::Array(items)) => items,
        None => Vec::new(),
        Some(_) => return Err("Array store value is not an array".into()),
    };
    apply_array_mutation(&mut items, request.mutation)?;
    let value = Value::Array(items);
    store.set(request.key, value.clone());
    store.save().map_err(|e| e.to_string())?;
    Ok(ScopedStoreResponse { value })
}

#[tauri::command]
pub fn patch_settings(
    app: AppHandle,
    request: SettingsPatchRequest,
) -> Result<ScopedStoreResponse, String> {
    if request.values.is_empty()
        || serde_json::to_vec(&request.values)
            .map_err(|_| "Invalid settings patch".to_string())?
            .len()
            > MAX_VALUE_BYTES
    {
        return Err("Invalid settings patch".into());
    }
    if request
        .values
        .keys()
        .any(|key| key.is_empty() || key.len() > MAX_ENTRY_KEY_BYTES)
    {
        return Err("Invalid settings key".into());
    }

    let _transaction = STORE_MUTATION
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner());
    let store = app.store(STORE_PATH).map_err(|e| e.to_string())?;
    let mut settings = match store.get("settings") {
        Some(Value::Object(settings)) => settings,
        None => Map::new(),
        Some(_) => return Err("Settings value is not an object".into()),
    };
    apply_settings_patch(&mut settings, request.values, request.expected.as_ref())?;
    let value = Value::Object(settings);
    store.set("settings", value.clone());
    store.save().map_err(|e| e.to_string())?;
    Ok(ScopedStoreResponse { value })
}

#[cfg(test)]
mod tests {
    use super::{
        apply_array_mutation, apply_mutation, apply_settings_patch, ArrayStoreMutation,
        ScopedStoreMutation,
    };
    use serde_json::{json, Map};

    #[test]
    fn scoped_mutations_preserve_other_connections() {
        let mut map = Map::from_iter([("other".into(), json!(["kept"]))]);
        assert_eq!(
            apply_mutation(
                &mut map,
                "active",
                ScopedStoreMutation::AddString {
                    value: "one".into()
                },
            )
            .unwrap(),
            json!(["one"])
        );
        assert_eq!(map["other"], json!(["kept"]));
        assert_eq!(
            apply_mutation(
                &mut map,
                "active",
                ScopedStoreMutation::AddString {
                    value: "one".into()
                },
            )
            .unwrap(),
            json!(["one"])
        );
    }

    #[test]
    fn array_mutations_preserve_concurrent_unique_items() {
        let mut items = vec![json!({ "id": "existing", "pausedAt": "2026-01-01" })];
        apply_array_mutation(
            &mut items,
            ArrayStoreMutation::AppendUnique {
                value: json!({ "id": "new", "pausedAt": "2026-01-02" }),
                identity: Map::from_iter([("id".into(), json!("new"))]),
                limit: Some(10),
                sort_field: Some("pausedAt".into()),
            },
        )
        .unwrap();
        assert_eq!(items.len(), 2);
        apply_array_mutation(
            &mut items,
            ArrayStoreMutation::RemoveMatching {
                identity: Map::from_iter([("id".into(), json!("existing"))]),
            },
        )
        .unwrap();
        assert_eq!(
            items,
            vec![json!({ "id": "new", "pausedAt": "2026-01-02" })]
        );
    }

    #[test]
    fn settings_patches_merge_independent_fields() {
        let mut settings = Map::from_iter([("theme".into(), json!("light"))]);
        apply_settings_patch(
            &mut settings,
            Map::from_iter([("language".into(), json!("sk"))]),
            None,
        )
        .unwrap();
        assert_eq!(settings["theme"], json!("light"));
        assert_eq!(settings["language"], json!("sk"));

        let expected = Map::from_iter([("theme".into(), json!("dark"))]);
        assert!(apply_settings_patch(
            &mut settings,
            Map::from_iter([("language".into(), json!("en"))]),
            Some(&expected),
        )
        .is_err());
        assert_eq!(settings["language"], json!("sk"));
    }
}
