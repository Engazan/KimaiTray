use serde_json::Value;
use tauri::Runtime;
use tauri_plugin_store::Store;

pub(crate) trait StoreBackend {
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

pub(crate) fn persist_value_with_rollback(
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

pub(crate) fn persist_changes_with_rollback(
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
