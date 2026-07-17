use std::collections::HashSet;
use std::str::FromStr;
use std::sync::Mutex;

use log::{error, info};
use tauri::{AppHandle, Emitter, Manager};
use tauri_plugin_global_shortcut::{GlobalShortcutExt, Shortcut, ShortcutState};
use tauri_plugin_store::StoreExt;

use crate::tray;

const STORE_PATH: &str = "settings.json";
type ShortcutSet = [String; 8];
// Protect the complete unregister/register/rollback transaction. Separate
// snapshots allow concurrent settings windows to interleave OS registrations.
static SHORTCUT_STATE: Mutex<Option<ShortcutSet>> = Mutex::new(None);

fn validate_shortcuts(values: [&str; 8]) -> Result<(), String> {
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
    let [toggle_popup, start_stop_timer, new_task, pause_resume, continue_last_task, edit_note, open_kimai, open_settings] =
        shortcuts;
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

    if !new_task.is_empty() {
        let handle = app.clone();
        gs.on_shortcut(new_task.as_str(), move |_app, _shortcut, event| {
            if event.state == ShortcutState::Pressed {
                tray::show_popup_window(&handle);
                if let Some(popup) = handle.get_webview_window("tray-popup") {
                    let _ = popup.emit("kimai://new-task", ());
                }
            }
        })
        .map_err(|e| format!("New-task shortcut: {e}"))?;
        info!("Registered new-task shortcut: {new_task}");
    }

    if !pause_resume.is_empty() {
        let handle = app.clone();
        gs.on_shortcut(pause_resume.as_str(), move |_app, _shortcut, event| {
            if event.state == ShortcutState::Pressed {
                if let Some(popup) = handle.get_webview_window("tray-popup") {
                    let _ = popup.emit("kimai://pause-resume-timer", ());
                }
            }
        })
        .map_err(|e| format!("Pause/resume shortcut: {e}"))?;
        info!("Registered pause-resume shortcut: {pause_resume}");
    }

    if !continue_last_task.is_empty() {
        let handle = app.clone();
        gs.on_shortcut(
            continue_last_task.as_str(),
            move |_app, _shortcut, event| {
                if event.state == ShortcutState::Pressed {
                    if let Some(popup) = handle.get_webview_window("tray-popup") {
                        let _ = popup.emit("kimai://continue-last-task", ());
                    }
                }
            },
        )
        .map_err(|e| format!("Continue-last-task shortcut: {e}"))?;
        info!("Registered continue-last-task shortcut: {continue_last_task}");
    }

    if !edit_note.is_empty() {
        let handle = app.clone();
        gs.on_shortcut(edit_note.as_str(), move |_app, _shortcut, event| {
            if event.state == ShortcutState::Pressed {
                tray::show_popup_window(&handle);
                if let Some(popup) = handle.get_webview_window("tray-popup") {
                    let _ = popup.emit("kimai://edit-active-note", ());
                }
            }
        })
        .map_err(|e| format!("Edit-note shortcut: {e}"))?;
        info!("Registered edit-note shortcut: {edit_note}");
    }

    if !open_kimai.is_empty() {
        let handle = app.clone();
        gs.on_shortcut(open_kimai.as_str(), move |_app, _shortcut, event| {
            if event.state == ShortcutState::Pressed {
                tray::open_kimai(&handle);
            }
        })
        .map_err(|e| format!("Open-Kimai shortcut: {e}"))?;
        info!("Registered open-Kimai shortcut: {open_kimai}");
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
    new_task: String,
    pause_resume: String,
    continue_last_task: String,
    edit_note: String,
    open_kimai: String,
    open_settings: String,
) -> Result<(), String> {
    validate_shortcuts([
        &toggle_popup,
        &start_stop_timer,
        &new_task,
        &pause_resume,
        &continue_last_task,
        &edit_note,
        &open_kimai,
        &open_settings,
    ])?;
    if !crate::platform::supports_global_shortcuts() {
        return Ok(());
    }
    let next = [
        toggle_popup,
        start_stop_timer,
        new_task,
        pause_resume,
        continue_last_task,
        edit_note,
        open_kimai,
        open_settings,
    ];
    let mut state = SHORTCUT_STATE
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner());
    let previous = state.clone();
    let gs = app.global_shortcut();
    gs.unregister_all().map_err(|e| e.to_string())?;

    if let Err(registration_error) = register_handlers(&app, &next) {
        let _ = gs.unregister_all();
        if let Some(previous) = previous {
            if let Err(rollback_error) = register_handlers(&app, &previous) {
                let _ = gs.unregister_all();
                *state = None;
                error!("Failed to restore previous shortcuts: {rollback_error}");
            }
        }
        return Err(registration_error);
    }

    *state = Some(next);
    Ok(())
}

pub fn register_from_store(app: &AppHandle) {
    if !crate::platform::supports_global_shortcuts() {
        info!("Global shortcuts are unavailable in this Wayland session");
        return;
    }
    let (toggle, timer, new_task, pause_resume, continue_last, edit_note, open_kimai, settings) =
        match app.store(STORE_PATH) {
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
                    get("shortcutNewTask"),
                    get("shortcutPauseResume"),
                    get("shortcutContinueLastTask"),
                    get("shortcutEditNote"),
                    get("shortcutOpenKimai"),
                    get("shortcutOpenSettings"),
                )
            }
            Err(_) => return,
        };

    if toggle.is_empty()
        && timer.is_empty()
        && new_task.is_empty()
        && pause_resume.is_empty()
        && continue_last.is_empty()
        && edit_note.is_empty()
        && open_kimai.is_empty()
        && settings.is_empty()
    {
        return;
    }

    if let Err(e) = register_shortcuts(
        app.clone(),
        toggle,
        timer,
        new_task,
        pause_resume,
        continue_last,
        edit_note,
        open_kimai,
        settings,
    ) {
        error!("Failed to register shortcuts from store: {e}");
    }
}

#[cfg(test)]
mod tests {
    use super::validate_shortcuts;

    #[test]
    fn validates_complete_shortcut_set_before_registration() {
        assert!(validate_shortcuts([
            "CommandOrControl+Shift+K",
            "Alt+T",
            "Alt+N",
            "Alt+P",
            "Alt+L",
            "Alt+D",
            "Alt+O",
            "",
        ])
        .is_ok());
        assert!(validate_shortcuts([
            "not-a-shortcut",
            "Alt+T",
            "Alt+N",
            "Alt+P",
            "Alt+L",
            "Alt+D",
            "Alt+O",
            "",
        ])
        .is_err());
        assert!(validate_shortcuts([
            "Alt+T", "Alt+T", "Alt+N", "Alt+P", "Alt+L", "Alt+D", "Alt+O", "",
        ])
        .is_err());
    }
}
