use std::collections::HashSet;
use std::str::FromStr;
use std::sync::Mutex;

use log::{error, info};
use tauri::{AppHandle, Emitter, Manager};
use tauri_plugin_global_shortcut::{GlobalShortcutExt, Shortcut, ShortcutState};
use tauri_plugin_store::StoreExt;

use crate::tray;

const STORE_PATH: &str = "settings.json";
type ShortcutSet = [String; 3];
static LAST_SHORTCUTS: Mutex<Option<ShortcutSet>> = Mutex::new(None);

fn validate_shortcuts(values: [&str; 3]) -> Result<(), String> {
    let mut ids = HashSet::new();
    for value in values.into_iter().filter(|value| !value.is_empty()) {
        let shortcut =
            Shortcut::from_str(value).map_err(|e| format!("Invalid shortcut {value}: {e}"))?;
        if !ids.insert(shortcut.id()) {
            return Err(format!("Duplicate shortcut: {value}"));
        }
    }
    Ok(())
}

fn register_handlers(app: &AppHandle, shortcuts: &ShortcutSet) -> Result<(), String> {
    let [toggle_popup, start_stop_timer, open_settings] = shortcuts;
    let gs = app.global_shortcut();

    if !toggle_popup.is_empty() {
        let handle = app.clone();
        gs.on_shortcut(toggle_popup.as_str(), move |_app, _shortcut, event| {
            if event.state == ShortcutState::Pressed {
                tray::toggle_popup_window(&handle);
            }
        })
        .map_err(|e| format!("Toggle popup shortcut: {e}"))?;
        info!("Registered toggle-popup shortcut: {toggle_popup}");
    }

    if !start_stop_timer.is_empty() {
        let handle = app.clone();
        gs.on_shortcut(start_stop_timer.as_str(), move |_app, _shortcut, event| {
            if event.state == ShortcutState::Pressed {
                if let Some(popup) = handle.get_webview_window("tray-popup") {
                    let _ = popup.emit("kimai://toggle-timer", ());
                }
            }
        })
        .map_err(|e| format!("Start/stop timer shortcut: {e}"))?;
        info!("Registered start-stop-timer shortcut: {start_stop_timer}");
    }

    if !open_settings.is_empty() {
        let handle = app.clone();
        gs.on_shortcut(open_settings.as_str(), move |_app, _shortcut, event| {
            if event.state == ShortcutState::Pressed {
                tray::show_settings_window(&handle);
            }
        })
        .map_err(|e| format!("Open settings shortcut: {e}"))?;
        info!("Registered open-settings shortcut: {open_settings}");
    }

    Ok(())
}

#[tauri::command]
pub fn register_shortcuts(
    app: AppHandle,
    toggle_popup: String,
    start_stop_timer: String,
    open_settings: String,
) -> Result<(), String> {
    validate_shortcuts([&toggle_popup, &start_stop_timer, &open_settings])?;
    let next = [toggle_popup, start_stop_timer, open_settings];
    let previous = LAST_SHORTCUTS
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner())
        .clone();
    let gs = app.global_shortcut();
    gs.unregister_all().map_err(|e| e.to_string())?;

    if let Err(registration_error) = register_handlers(&app, &next) {
        let _ = gs.unregister_all();
        if let Some(previous) = previous {
            if let Err(rollback_error) = register_handlers(&app, &previous) {
                let _ = gs.unregister_all();
                error!("Failed to restore previous shortcuts: {rollback_error}");
            }
        }
        return Err(registration_error);
    }

    *LAST_SHORTCUTS
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner()) = Some(next);
    Ok(())
}

pub fn register_from_store(app: &AppHandle) {
    let (toggle, timer, settings) = match app.store(STORE_PATH) {
        Ok(store) => {
            let s = store
                .get("settings")
                .and_then(|v| v.as_object().cloned())
                .unwrap_or_default();
            let get = |key: &str| {
                s.get(key)
                    .and_then(|v| v.as_str())
                    .unwrap_or("")
                    .to_string()
            };
            (
                get("shortcutTogglePopup"),
                get("shortcutStartStopTimer"),
                get("shortcutOpenSettings"),
            )
        }
        Err(_) => return,
    };

    if toggle.is_empty() && timer.is_empty() && settings.is_empty() {
        return;
    }

    if let Err(e) = register_shortcuts(app.clone(), toggle, timer, settings) {
        error!("Failed to register shortcuts from store: {e}");
    }
}

#[cfg(test)]
mod tests {
    use super::validate_shortcuts;

    #[test]
    fn validates_complete_shortcut_set_before_registration() {
        assert!(validate_shortcuts(["CommandOrControl+Shift+K", "Alt+T", ""]).is_ok());
        assert!(validate_shortcuts(["not-a-shortcut", "Alt+T", ""]).is_err());
        assert!(validate_shortcuts(["Alt+T", "Alt+T", ""]).is_err());
    }
}
