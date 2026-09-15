use super::STORE_PATH;
use tauri::{AppHandle, Emitter, Manager};
use tauri_plugin_opener::OpenerExt;
use tauri_plugin_store::StoreExt;

pub(super) fn refresh_popup(app: &AppHandle) {
    if let Some(popup) = app.get_webview_window("tray-popup") {
        let _ = popup.emit("kimai://refresh", ());
    }
}

pub fn open_kimai(app: &AppHandle) {
    let handle = app.clone();
    tauri::async_runtime::spawn(async move {
        if let Ok(store) = handle.store(STORE_PATH) {
            if let Some(serde_json::Value::Object(s)) = store.get("settings") {
                if let Some(serde_json::Value::String(url)) = s.get("kimaiUrl") {
                    if let Ok(parsed) = tauri::Url::parse(url) {
                        let allowed = matches!(parsed.scheme(), "http" | "https")
                            && parsed.username().is_empty()
                            && parsed.password().is_none();
                        if allowed {
                            let _ = handle.opener().open_url(parsed.as_str(), None::<&str>);
                        }
                    }
                }
            }
        }
    });
}

#[tauri::command]
pub fn open_kimai_in_browser(app: AppHandle) {
    open_kimai(&app);
}

pub fn show_settings_window(app: &AppHandle) {
    if let Some(w) = app.get_webview_window("settings") {
        let _ = w.show();
        let _ = w.set_focus();
    }
}
