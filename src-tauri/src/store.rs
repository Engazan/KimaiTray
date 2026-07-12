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

#[cfg(test)]
mod tests {
    use super::{apply_mutation, ScopedStoreMutation};
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
}
