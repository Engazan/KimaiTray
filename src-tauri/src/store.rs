use std::sync::Mutex;

use serde::{Deserialize, Serialize};
use serde_json::{json, Map, Value};
use tauri::{AppHandle, Runtime, WebviewWindow};
use tauri_plugin_store::{Store, StoreExt};

const STORE_PATH: &str = "settings.json";
const MAX_ENTRY_KEY_BYTES: usize = 256;
const MAX_VALUE_BYTES: usize = 2 * 1024 * 1024;
const MAX_STRING_ITEMS: usize = 10_000;
const MAX_STRING_BYTES: usize = 4 * 1024;
static STORE_MUTATION: Mutex<()> = Mutex::new(());

trait StoreBackend {
    fn get_value(&self, key: &str) -> Option<Value>;
    fn set_value(&self, key: &str, value: Value);
    fn delete_value(&self, key: &str);
    fn save_value(&self) -> Result<(), String>;
}

impl<R: Runtime> StoreBackend for Store<R> {
    fn get_value(&self, key: &str) -> Option<Value> {
        self.get(key)
    }

    fn set_value(&self, key: &str, value: Value) {
        self.set(key, value);
    }

    fn delete_value(&self, key: &str) {
        self.delete(key);
    }

    fn save_value(&self) -> Result<(), String> {
        self.save().map_err(|error| error.to_string())
    }
}

fn persist_value_with_rollback(
    store: &impl StoreBackend,
    key: &str,
    value: Option<Value>,
) -> Result<(), String> {
    let previous = store.get_value(key);
    match value {
        Some(value) => store.set_value(key, value),
        None => store.delete_value(key),
    }

    if let Err(error) = store.save_value() {
        match previous {
            Some(previous) => store.set_value(key, previous),
            None => store.delete_value(key),
        }
        let _ = store.save_value();
        return Err(error);
    }
    Ok(())
}

fn persist_changes_with_rollback(
    store: &impl StoreBackend,
    changes: &[(String, Option<Value>)],
) -> Result<(), String> {
    let previous = changes
        .iter()
        .map(|(key, _)| (key.clone(), store.get_value(key)))
        .collect::<Vec<_>>();
    for (key, value) in changes {
        match value {
            Some(value) => store.set_value(key, value.clone()),
            None => store.delete_value(key),
        }
    }
    if let Err(error) = store.save_value() {
        for (key, value) in previous {
            match value {
                Some(value) => store.set_value(&key, value),
                None => store.delete_value(&key),
            }
        }
        let _ = store.save_value();
        return Err(error);
    }
    Ok(())
}

pub(crate) fn persist_store_value<R: Runtime>(
    store: &Store<R>,
    key: &str,
    value: Option<Value>,
) -> Result<(), String> {
    persist_value_with_rollback(store, key, value)
}

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

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FavoriteScopeRequest {
    connection_id: String,
    base_url: Option<String>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MoveFavoritesRequest {
    from_connection_id: String,
    to_connection_id: String,
    from_base_url: Option<String>,
    to_base_url: Option<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MoveFavoritesResponse {
    count: usize,
}

#[derive(Deserialize, Serialize)]
#[serde(tag = "type", rename_all = "camelCase")]
pub enum LegacyStoreMigration {
    CategoryConfig,
    CategoryLastActivity,
    HiddenTasks { connection_id: String },
    PausedTimer { generated_id: String },
    SettingsConnection { generated_id: String, name: String },
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LegacyStoreMigrationRequest {
    migration: LegacyStoreMigration,
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

fn validate_scoped_store_window(
    window_label: &str,
    key: &str,
    previous: Option<&Value>,
    next: &Value,
) -> Result<(), String> {
    match (window_label, key) {
        ("settings", "categoryConfig") => Ok(()),
        ("tray-popup", "categoryConfig") => {
            let previous_source = previous
                .and_then(Value::as_object)
                .and_then(|config| config.get("sourceUrl"));
            let next_source = next.as_object().and_then(|config| config.get("sourceUrl"));
            if previous_source == next_source {
                Ok(())
            } else {
                Err("Tray window cannot change the category source URL".into())
            }
        }
        ("tray-popup", "categoryLastActivity" | "hiddenRecentTasksByConnection") => Ok(()),
        _ => Err("Window is not authorized to mutate this scoped store".into()),
    }
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

fn validate_settings_patch_window(
    window_label: &str,
    settings: &Map<String, Value>,
    values: &Map<String, Value>,
) -> Result<(), String> {
    if window_label == "settings" {
        return Ok(());
    }
    if window_label != "tray-popup"
        || values
            .keys()
            .any(|key| !matches!(key.as_str(), "activeConnectionId" | "kimaiUrl"))
    {
        return Err("Window is not authorized to patch these settings".into());
    }

    let connection_id = values
        .get("activeConnectionId")
        .and_then(Value::as_str)
        .ok_or("Tray settings patch must select a connection")?;
    let connection = settings
        .get("connections")
        .and_then(Value::as_array)
        .and_then(|connections| {
            connections.iter().find(|connection| {
                connection.get("id").and_then(Value::as_str) == Some(connection_id)
            })
        })
        .ok_or("Tray settings patch selected an unknown connection")?;
    let configured_url = connection
        .get("url")
        .and_then(Value::as_str)
        .ok_or("Selected connection URL is invalid")?;
    if values.get("kimaiUrl").and_then(Value::as_str) != Some(configured_url) {
        return Err("Tray settings patch URL does not match the selected connection".into());
    }
    Ok(())
}

fn belongs_to_connection(value: &Value, connection_id: &str, base_url: Option<&str>) -> bool {
    let Some(object) = value.as_object() else {
        return false;
    };
    match object.get("connectionId").and_then(Value::as_str) {
        Some(stored) => stored == connection_id,
        None => base_url.is_some_and(|base_url| {
            object
                .get("baseUrl")
                .and_then(Value::as_str)
                .is_none_or(|stored| stored == base_url)
        }),
    }
}

fn claim_legacy_favorites(items: &mut [Value], connection_id: &str, base_url: &str) {
    for item in items {
        if belongs_to_connection(item, connection_id, Some(base_url))
            && item
                .as_object()
                .is_some_and(|object| !object.contains_key("connectionId"))
        {
            if let Some(object) = item.as_object_mut() {
                object.insert("connectionId".into(), Value::String(connection_id.into()));
                object.insert("baseUrl".into(), Value::String(base_url.into()));
            }
        }
    }
}

fn move_favorites(items: &mut Vec<Value>, request: &MoveFavoritesRequest) -> usize {
    let moving_count = items
        .iter()
        .filter(|item| {
            belongs_to_connection(
                item,
                &request.from_connection_id,
                request.from_base_url.as_deref(),
            )
        })
        .count();
    let destination_keys = items
        .iter()
        .filter(|item| {
            belongs_to_connection(
                item,
                &request.to_connection_id,
                request.to_base_url.as_deref(),
            )
        })
        .filter_map(|item| item.get("key").and_then(Value::as_str).map(str::to_owned))
        .collect::<std::collections::HashSet<_>>();

    items.retain_mut(|item| {
        if !belongs_to_connection(
            item,
            &request.from_connection_id,
            request.from_base_url.as_deref(),
        ) {
            return true;
        }
        let duplicate = item
            .get("key")
            .and_then(Value::as_str)
            .is_some_and(|key| destination_keys.contains(key));
        if duplicate {
            return false;
        }
        if let Some(object) = item.as_object_mut() {
            object.insert(
                "connectionId".into(),
                Value::String(request.to_connection_id.clone()),
            );
            match &request.to_base_url {
                Some(base_url) => {
                    object.insert("baseUrl".into(), Value::String(base_url.clone()));
                }
                None => {
                    object.remove("baseUrl");
                }
            }
        }
        true
    });
    moving_count
}

fn migrate_legacy_store_backend(
    store: &impl StoreBackend,
    migration: LegacyStoreMigration,
) -> Result<Value, String> {
    if let LegacyStoreMigration::SettingsConnection { generated_id, name } = migration {
        if generated_id.is_empty()
            || generated_id.len() > MAX_ENTRY_KEY_BYTES
            || name.is_empty()
            || name.len() > MAX_ENTRY_KEY_BYTES
        {
            return Err("Invalid migrated connection identity".into());
        }
        let mut settings = match store.get_value("settings") {
            Some(Value::Object(settings)) => settings,
            None => Map::new(),
            Some(_) => return Err("Settings value is not an object".into()),
        };
        let has_connections = settings
            .get("connections")
            .and_then(Value::as_array)
            .is_some_and(|connections| !connections.is_empty());
        if !has_connections {
            let url = settings
                .get("kimaiUrl")
                .and_then(Value::as_str)
                .unwrap_or("");
            if !url.is_empty() {
                settings.insert(
                    "connections".into(),
                    Value::Array(vec![json!({
                        "id": generated_id,
                        "name": name,
                        "url": url,
                    })]),
                );
                settings.insert("activeConnectionId".into(), Value::String(generated_id));
                persist_value_with_rollback(
                    store,
                    "settings",
                    Some(Value::Object(settings.clone())),
                )?;
            }
        }
        return Ok(Value::Object(settings));
    }

    let (target_key, legacy_key) = match &migration {
        LegacyStoreMigration::CategoryConfig => ("categoryConfig", "csConfig"),
        LegacyStoreMigration::CategoryLastActivity => ("categoryLastActivity", "csLastActivity"),
        LegacyStoreMigration::HiddenTasks { .. } => {
            ("hiddenRecentTasksByConnection", "hiddenRecentTasks")
        }
        LegacyStoreMigration::PausedTimer { .. } => ("pausedTimers", "pausedTimer"),
        LegacyStoreMigration::SettingsConnection { .. } => unreachable!(),
    };
    let current = store.get_value(target_key);
    let legacy = store.get_value(legacy_key);
    let mut changes = Vec::new();

    let response = match migration {
        LegacyStoreMigration::CategoryConfig | LegacyStoreMigration::CategoryLastActivity => {
            match current {
                Some(value) if value.is_object() => value,
                Some(_) => return Err("Migrated store value is not an object".into()),
                None => match legacy.clone() {
                    Some(value) if value.is_object() => {
                        changes.push((target_key.into(), Some(value.clone())));
                        value
                    }
                    Some(_) => return Err("Legacy store value is not an object".into()),
                    None => Value::Object(Map::new()),
                },
            }
        }
        LegacyStoreMigration::HiddenTasks { connection_id } => {
            if connection_id.is_empty() || connection_id.len() > MAX_ENTRY_KEY_BYTES {
                return Err("Invalid hidden task connection id".into());
            }
            let mut map = match current {
                Some(Value::Object(map)) => map,
                None => Map::new(),
                Some(_) => return Err("Hidden task store value is not an object".into()),
            };
            if !map.contains_key(&connection_id) {
                if let Some(legacy_value) = legacy.as_ref() {
                    let items = string_items(Some(legacy_value))?;
                    map.insert(
                        connection_id.clone(),
                        serde_json::to_value(items).map_err(|error| error.to_string())?,
                    );
                    changes.push((target_key.into(), Some(Value::Object(map.clone()))));
                }
            }
            let value = map
                .get(&connection_id)
                .cloned()
                .unwrap_or_else(|| Value::Array(Vec::new()));
            string_items(Some(&value))?;
            value
        }
        LegacyStoreMigration::PausedTimer { generated_id } => {
            if generated_id.is_empty() || generated_id.len() > MAX_ENTRY_KEY_BYTES {
                return Err("Invalid paused timer id".into());
            }
            match current {
                Some(Value::Array(items)) => Value::Array(items),
                Some(_) => return Err("Paused timer store value is not an array".into()),
                None => match legacy.clone() {
                    Some(Value::Object(mut timer)) => {
                        timer
                            .entry("id")
                            .or_insert_with(|| Value::String(generated_id));
                        let value = Value::Array(vec![Value::Object(timer)]);
                        changes.push((target_key.into(), Some(value.clone())));
                        value
                    }
                    Some(_) => return Err("Legacy paused timer is not an object".into()),
                    None => Value::Array(Vec::new()),
                },
            }
        }
        LegacyStoreMigration::SettingsConnection { .. } => unreachable!(),
    };

    if legacy.is_some() {
        changes.push((legacy_key.into(), None));
    }
    if !changes.is_empty() {
        persist_changes_with_rollback(store, &changes)?;
    }
    Ok(response)
}

#[tauri::command]
pub fn migrate_legacy_store(
    app: AppHandle,
    request: LegacyStoreMigrationRequest,
) -> Result<ScopedStoreResponse, String> {
    let _transaction = STORE_MUTATION
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner());
    let store = app.store(STORE_PATH).map_err(|error| error.to_string())?;
    let value = migrate_legacy_store_backend(store.as_ref(), request.migration)?;
    Ok(ScopedStoreResponse { value })
}

#[tauri::command]
pub fn mutate_scoped_store(
    app: AppHandle,
    window: WebviewWindow,
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
    let previous = map.get(&request.entry_key).cloned();
    let value = apply_mutation(&mut map, &request.entry_key, request.mutation)?;
    validate_scoped_store_window(window.label(), &request.key, previous.as_ref(), &value)?;
    persist_store_value(store.as_ref(), &request.key, Some(Value::Object(map)))?;
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
    persist_store_value(store.as_ref(), &request.key, Some(value.clone()))?;
    Ok(ScopedStoreResponse { value })
}

#[tauri::command]
pub fn patch_settings(
    app: AppHandle,
    window: WebviewWindow,
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
    validate_settings_patch_window(window.label(), &settings, &request.values)?;
    apply_settings_patch(&mut settings, request.values, request.expected.as_ref())?;
    let value = Value::Object(settings);
    persist_store_value(store.as_ref(), "settings", Some(value.clone()))?;
    Ok(ScopedStoreResponse { value })
}

#[tauri::command]
pub fn claim_legacy_favorites_store(
    app: AppHandle,
    request: FavoriteScopeRequest,
) -> Result<ScopedStoreResponse, String> {
    let Some(base_url) = request.base_url.as_deref() else {
        return Err("Favorite legacy base URL is required".into());
    };
    if request.connection_id.is_empty() || request.connection_id.len() > MAX_ENTRY_KEY_BYTES {
        return Err("Invalid favorite connection id".into());
    }
    let _transaction = STORE_MUTATION
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner());
    let store = app.store(STORE_PATH).map_err(|e| e.to_string())?;
    let mut items = match store.get("favoriteTasks") {
        Some(Value::Array(items)) => items,
        None => Vec::new(),
        Some(_) => return Err("Favorite store value is not an array".into()),
    };
    claim_legacy_favorites(&mut items, &request.connection_id, base_url);
    let value = Value::Array(items);
    persist_store_value(store.as_ref(), "favoriteTasks", Some(value.clone()))?;
    Ok(ScopedStoreResponse { value })
}

#[tauri::command]
pub fn move_favorites_store(
    app: AppHandle,
    request: MoveFavoritesRequest,
) -> Result<MoveFavoritesResponse, String> {
    if request.from_connection_id.is_empty()
        || request.to_connection_id.is_empty()
        || request.from_connection_id == request.to_connection_id
    {
        return Err("Invalid favorite connection move".into());
    }
    let _transaction = STORE_MUTATION
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner());
    let store = app.store(STORE_PATH).map_err(|e| e.to_string())?;
    let mut items = match store.get("favoriteTasks") {
        Some(Value::Array(items)) => items,
        None => Vec::new(),
        Some(_) => return Err("Favorite store value is not an array".into()),
    };
    let count = move_favorites(&mut items, &request);
    persist_store_value(store.as_ref(), "favoriteTasks", Some(Value::Array(items)))?;
    Ok(MoveFavoritesResponse { count })
}

#[cfg(test)]
mod tests {
    use super::{
        apply_array_mutation, apply_mutation, apply_settings_patch, claim_legacy_favorites,
        migrate_legacy_store_backend, move_favorites, persist_value_with_rollback,
        validate_scoped_store_window, validate_settings_patch_window, ArrayStoreMutation,
        LegacyStoreMigration, MoveFavoritesRequest, ScopedStoreMutation, StoreBackend,
    };
    use serde_json::{json, Map, Value};
    use std::{collections::HashMap, sync::Mutex};

    struct FailingStore {
        values: Mutex<HashMap<String, Value>>,
        save_results: Mutex<Vec<Result<(), String>>>,
    }

    impl StoreBackend for FailingStore {
        fn get_value(&self, key: &str) -> Option<Value> {
            self.values.lock().unwrap().get(key).cloned()
        }

        fn set_value(&self, key: &str, value: Value) {
            self.values.lock().unwrap().insert(key.into(), value);
        }

        fn delete_value(&self, key: &str) {
            self.values.lock().unwrap().remove(key);
        }

        fn save_value(&self) -> Result<(), String> {
            let mut results = self.save_results.lock().unwrap();
            if results.is_empty() {
                Ok(())
            } else {
                results.remove(0)
            }
        }
    }

    #[test]
    fn persistence_failure_restores_existing_in_memory_value() {
        let store = FailingStore {
            values: Mutex::new(HashMap::from([("settings".into(), json!({"old": true}))])),
            save_results: Mutex::new(vec![Err("disk unavailable".into()), Ok(())]),
        };

        assert!(
            persist_value_with_rollback(&store, "settings", Some(json!({"new": true}))).is_err()
        );
        assert_eq!(store.get_value("settings"), Some(json!({"old": true})));
    }

    #[test]
    fn persistence_failure_removes_new_in_memory_value() {
        let store = FailingStore {
            values: Mutex::new(HashMap::new()),
            save_results: Mutex::new(vec![Err("disk unavailable".into()), Ok(())]),
        };

        assert!(persist_value_with_rollback(&store, "new-key", Some(json!([1, 2, 3]))).is_err());
        assert_eq!(store.get_value("new-key"), None);
    }

    #[test]
    fn persistence_failure_restores_deleted_in_memory_value() {
        let store = FailingStore {
            values: Mutex::new(HashMap::from([("credential".into(), json!("secret"))])),
            save_results: Mutex::new(vec![Err("disk unavailable".into()), Ok(())]),
        };

        assert!(persist_value_with_rollback(&store, "credential", None).is_err());
        assert_eq!(store.get_value("credential"), Some(json!("secret")));
    }

    #[test]
    fn legacy_map_migration_moves_and_removes_keys_atomically() {
        let store = FailingStore {
            values: Mutex::new(HashMap::from([(
                "csConfig".into(),
                json!({"connection-a": {"categories": []}}),
            )])),
            save_results: Mutex::new(Vec::new()),
        };

        let value =
            migrate_legacy_store_backend(&store, LegacyStoreMigration::CategoryConfig).unwrap();
        assert_eq!(value, json!({"connection-a": {"categories": []}}));
        assert_eq!(store.get_value("categoryConfig"), Some(value));
        assert_eq!(store.get_value("csConfig"), None);
    }

    #[test]
    fn hidden_task_migration_preserves_existing_connection_scope() {
        let store = FailingStore {
            values: Mutex::new(HashMap::from([
                (
                    "hiddenRecentTasksByConnection".into(),
                    json!({"connection-a": ["current"]}),
                ),
                ("hiddenRecentTasks".into(), json!(["legacy"])),
            ])),
            save_results: Mutex::new(Vec::new()),
        };

        let value = migrate_legacy_store_backend(
            &store,
            LegacyStoreMigration::HiddenTasks {
                connection_id: "connection-a".into(),
            },
        )
        .unwrap();
        assert_eq!(value, json!(["current"]));
        assert_eq!(store.get_value("hiddenRecentTasks"), None);
    }

    #[test]
    fn multi_key_migration_failure_restores_every_original_value() {
        let legacy = json!({"connection-a": {"leaf": true}});
        let store = FailingStore {
            values: Mutex::new(HashMap::from([("csLastActivity".into(), legacy.clone())])),
            save_results: Mutex::new(vec![Err("disk unavailable".into()), Ok(())]),
        };

        assert!(
            migrate_legacy_store_backend(&store, LegacyStoreMigration::CategoryLastActivity,)
                .is_err()
        );
        assert_eq!(store.get_value("categoryLastActivity"), None);
        assert_eq!(store.get_value("csLastActivity"), Some(legacy));
    }

    #[test]
    fn legacy_connection_claim_is_idempotent_across_windows() {
        let store = FailingStore {
            values: Mutex::new(HashMap::from([(
                "settings".into(),
                json!({"kimaiUrl": "https://kimai.example.test", "connections": []}),
            )])),
            save_results: Mutex::new(Vec::new()),
        };

        migrate_legacy_store_backend(
            &store,
            LegacyStoreMigration::SettingsConnection {
                generated_id: "window-a".into(),
                name: "kimai.example.test".into(),
            },
        )
        .unwrap();
        let second = migrate_legacy_store_backend(
            &store,
            LegacyStoreMigration::SettingsConnection {
                generated_id: "window-b".into(),
                name: "other".into(),
            },
        )
        .unwrap();

        assert_eq!(second["activeConnectionId"], json!("window-a"));
        assert_eq!(second["connections"][0]["id"], json!("window-a"));
    }

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
    fn windows_can_only_mutate_owned_scoped_state() {
        let previous = json!({
            "sourceUrl": "https://config.test/categories.json",
            "categories": []
        });
        let synced = json!({
            "sourceUrl": "https://config.test/categories.json",
            "categories": [{"id": "support"}]
        });
        let changed_source = json!({
            "sourceUrl": "https://attacker.test/categories.json",
            "categories": []
        });

        assert!(validate_scoped_store_window(
            "tray-popup",
            "categoryConfig",
            Some(&previous),
            &synced,
        )
        .is_ok());
        assert!(validate_scoped_store_window(
            "tray-popup",
            "categoryConfig",
            Some(&previous),
            &changed_source,
        )
        .is_err());
        assert!(validate_scoped_store_window(
            "settings",
            "categoryConfig",
            Some(&previous),
            &changed_source,
        )
        .is_ok());
        assert!(
            validate_scoped_store_window("settings", "categoryLastActivity", None, &json!({}),)
                .is_err()
        );
    }

    #[test]
    fn tray_settings_patches_only_select_configured_connections() {
        let settings = Map::from_iter([(
            "connections".into(),
            json!([{
                "id": "connection-a",
                "url": "https://kimai.test"
            }]),
        )]);
        let valid = Map::from_iter([
            ("activeConnectionId".into(), json!("connection-a")),
            ("kimaiUrl".into(), json!("https://kimai.test")),
        ]);
        let arbitrary_url = Map::from_iter([
            ("activeConnectionId".into(), json!("connection-a")),
            ("kimaiUrl".into(), json!("https://attacker.test")),
        ]);

        assert!(validate_settings_patch_window("tray-popup", &settings, &valid).is_ok());
        assert!(validate_settings_patch_window("tray-popup", &settings, &arbitrary_url).is_err());
        assert!(validate_settings_patch_window(
            "tray-popup",
            &settings,
            &Map::from_iter([("theme".into(), json!("dark"))]),
        )
        .is_err());
        assert!(validate_settings_patch_window("settings", &settings, &arbitrary_url).is_ok());
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

    #[test]
    fn favorite_scope_moves_are_atomic_and_deduplicated() {
        let mut items = vec![
            json!({ "key": "duplicate", "baseUrl": "https://old" }),
            json!({ "key": "moved", "baseUrl": "https://old" }),
            json!({ "key": "duplicate", "connectionId": "new" }),
        ];
        claim_legacy_favorites(&mut items, "old", "https://old");
        let count = move_favorites(
            &mut items,
            &MoveFavoritesRequest {
                from_connection_id: "old".into(),
                to_connection_id: "new".into(),
                from_base_url: Some("https://old".into()),
                to_base_url: Some("https://new".into()),
            },
        );
        assert_eq!(count, 2);
        assert_eq!(items.len(), 2);
        assert!(items.iter().any(|item| {
            item["key"] == "moved"
                && item["connectionId"] == "new"
                && item["baseUrl"] == "https://new"
        }));
    }
}
