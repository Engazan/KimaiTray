use log::warn;
use tauri::AppHandle;
use tauri_plugin_store::StoreExt;

const STORE_PATH: &str = "settings.json";
const TOKEN_PREFIX: &str = "api-token:";
const KEYRING_SERVICE: &str = "eu.engazan.kimaitray";

fn token_key(base_url: &str) -> String {
    format!("{TOKEN_PREFIX}{}", base_url.trim_end_matches('/'))
}

fn keyring_entry(account: &str) -> Result<keyring::Entry, String> {
    keyring::Entry::new(KEYRING_SERVICE, account).map_err(|e| e.to_string())
}

fn save_to_keyring(account: &str, token: &str) -> Result<(), String> {
    let entry = keyring_entry(account)?;
    entry.set_password(token).map_err(|e| e.to_string())?;
    let stored = entry.get_password().map_err(|e| e.to_string())?;
    if stored != token {
        return Err("Credential verification failed".into());
    }
    Ok(())
}

fn get_from_keyring(account: &str) -> Result<Option<String>, String> {
    let entry = keyring_entry(account)?;
    match entry.get_password() {
        Ok(token) => Ok(Some(token)),
        Err(keyring::Error::NoEntry) => Ok(None),
        Err(e) => Err(e.to_string()),
    }
}

fn delete_from_keyring(account: &str) -> Result<(), String> {
    let entry = keyring_entry(account)?;
    match entry.delete_credential() {
        Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
        Err(e) => Err(e.to_string()),
    }
}

#[tauri::command]
pub async fn save_api_token(app: AppHandle, base_url: String, token: String) -> Result<(), String> {
    if base_url.is_empty() || token.is_empty() {
        return Err("URL and token must not be empty".into());
    }
    let account = token_key(&base_url);
    let keyring_account = account.clone();
    let keyring_token = token.clone();
    let secure_result = tauri::async_runtime::spawn_blocking(move || {
        save_to_keyring(&keyring_account, &keyring_token)
    })
    .await
    .map_err(|e| e.to_string())?;

    let store = app.store(STORE_PATH).map_err(|e| e.to_string())?;
    if secure_result.is_ok() {
        store.delete(&account);
    } else {
        // Compatibility fallback for Linux desktops without Secret Service.
        // The secure backend is retried on every subsequent read.
        warn!("OS credential store unavailable; using compatibility fallback");
        store.set(account, serde_json::Value::String(token));
    }
    store.save().map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_api_token(app: AppHandle, base_url: String) -> Result<Option<String>, String> {
    if base_url.is_empty() {
        return Ok(None);
    }
    let account = token_key(&base_url);
    let keyring_account = account.clone();
    let secure = tauri::async_runtime::spawn_blocking(move || get_from_keyring(&keyring_account))
        .await
        .map_err(|e| e.to_string())?;
    if let Ok(Some(token)) = secure {
        return Ok(Some(token));
    }

    let store = app.store(STORE_PATH).map_err(|e| e.to_string())?;
    let legacy = match store.get(&account) {
        Some(serde_json::Value::String(token)) => Some(token),
        _ => None,
    };
    if let Some(token) = legacy {
        let migration_account = account.clone();
        let migration_token = token.clone();
        let migrated = tauri::async_runtime::spawn_blocking(move || {
            save_to_keyring(&migration_account, &migration_token)
        })
        .await
        .map_err(|e| e.to_string())?;
        if migrated.is_ok() {
            store.delete(&account);
            store.save().map_err(|e| e.to_string())?;
        }
        return Ok(Some(token));
    }
    secure.map(|_| None)
}

#[tauri::command]
pub async fn delete_api_token(app: AppHandle, base_url: String) -> Result<(), String> {
    if base_url.is_empty() {
        return Ok(());
    }
    let account = token_key(&base_url);
    let keyring_account = account.clone();
    let secure_result =
        tauri::async_runtime::spawn_blocking(move || delete_from_keyring(&keyring_account))
            .await
            .map_err(|e| e.to_string())?;
    let store = app.store(STORE_PATH).map_err(|e| e.to_string())?;
    store.delete(&account);
    store.save().map_err(|e| e.to_string())?;
    if let Err(error) = secure_result {
        warn!("Failed to remove credential from OS store: {error}");
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::token_key;

    #[test]
    fn token_keys_are_stable_across_trailing_slashes() {
        assert_eq!(
            token_key("https://kimai.example.test/"),
            token_key("https://kimai.example.test")
        );
    }
}
