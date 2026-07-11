use log::warn;
use tauri::AppHandle;
use tauri_plugin_store::StoreExt;

const STORE_PATH: &str = "settings.json";
const TOKEN_PREFIX: &str = "api-token:";
const KEYRING_SERVICE: &str = "eu.engazan.kimaitray";
const MAX_CREDENTIAL_KEY_BYTES: usize = 4 * 1024;
const MAX_TOKEN_BYTES: usize = 64 * 1024;

fn validate_credential_key(value: &str) -> Result<(), String> {
    if value.is_empty() {
        return Err("Credential key must not be empty".into());
    }
    if value.len() > MAX_CREDENTIAL_KEY_BYTES {
        return Err("Credential key is too long".into());
    }
    if value.trim() != value || value.chars().any(char::is_control) {
        return Err("Credential key contains invalid characters".into());
    }
    Ok(())
}

fn validate_token(token: &str) -> Result<(), String> {
    if token.is_empty() {
        return Err("Token must not be empty".into());
    }
    if token.len() > MAX_TOKEN_BYTES {
        return Err("Token is too long".into());
    }
    Ok(())
}

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
    validate_credential_key(&base_url)?;
    validate_token(&token)?;
    let account = token_key(&base_url);
    let keyring_account = account.clone();
    let keyring_token = token.clone();
    tauri::async_runtime::spawn_blocking(move || save_to_keyring(&keyring_account, &keyring_token))
        .await
        .map_err(|e| e.to_string())?
        .map_err(|_| "OS credential store is unavailable".to_string())?;

    let store = app.store(STORE_PATH).map_err(|e| e.to_string())?;
    // Remove any value created by versions that used the settings store as a
    // compatibility fallback. New credentials are never written there.
    store.delete(&account);
    store.save().map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_api_token(app: AppHandle, base_url: String) -> Result<Option<String>, String> {
    if base_url.is_empty() {
        return Ok(None);
    }
    validate_credential_key(&base_url)?;
    let account = token_key(&base_url);
    let keyring_account = account.clone();
    let secure = tauri::async_runtime::spawn_blocking(move || get_from_keyring(&keyring_account))
        .await
        .map_err(|e| e.to_string())?;
    if let Ok(Some(token)) = secure {
        // A previous verified keyring write may have succeeded while the store
        // cleanup failed. Retry the plaintext cleanup on every secure read.
        let store = app.store(STORE_PATH).map_err(|e| e.to_string())?;
        if store.get(&account).is_some() {
            store.delete(&account);
            store.save().map_err(|e| e.to_string())?;
        }
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
        migrated.map_err(|_| "OS credential store is unavailable".to_string())?;
        store.delete(&account);
        store.save().map_err(|e| e.to_string())?;
        return Ok(Some(token));
    }
    secure.map(|_| None)
}

#[tauri::command]
pub async fn delete_api_token(app: AppHandle, base_url: String) -> Result<(), String> {
    if base_url.is_empty() {
        return Ok(());
    }
    validate_credential_key(&base_url)?;
    let account = token_key(&base_url);
    let keyring_account = account.clone();
    let secure_result =
        tauri::async_runtime::spawn_blocking(move || delete_from_keyring(&keyring_account))
            .await
            .map_err(|e| e.to_string())?;
    let store = app.store(STORE_PATH).map_err(|e| e.to_string())?;
    store.delete(&account);
    store.save().map_err(|e| e.to_string())?;
    secure_result.map_err(|error| {
        warn!("Failed to remove credential from OS store: {error}");
        "Failed to remove credential from OS store".to_string()
    })
}

#[cfg(test)]
mod tests {
    use super::{token_key, validate_credential_key, validate_token, MAX_TOKEN_BYTES};

    #[test]
    fn token_keys_are_stable_across_trailing_slashes() {
        assert_eq!(
            token_key("https://kimai.example.test/"),
            token_key("https://kimai.example.test")
        );
    }

    #[test]
    fn credential_keys_reject_empty_bounded_and_control_values() {
        assert!(validate_credential_key("conn-token:123").is_ok());
        assert!(validate_credential_key("").is_err());
        assert!(validate_credential_key(" conn-token:123").is_err());
        assert!(validate_credential_key("conn-token:\n123").is_err());
        assert!(validate_credential_key(&"a".repeat(4097)).is_err());
    }

    #[test]
    fn tokens_are_non_empty_and_bounded() {
        assert!(validate_token("secret").is_ok());
        assert!(validate_token("").is_err());
        assert!(validate_token(&"x".repeat(MAX_TOKEN_BYTES)).is_ok());
        assert!(validate_token(&"x".repeat(MAX_TOKEN_BYTES + 1)).is_err());
    }
}
