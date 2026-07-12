mod http;
mod idle;
mod keychain;
mod shortcuts;
mod store;
mod store_persistence;
mod tray;

use log::{error, info};
use std::io::Write;
use std::path::{Path, PathBuf};
use tauri::Manager;
use tauri_plugin_log::{Target, TargetKind};

/// Bundle identifier used before the KimaiMate → KimaiTray rename.
/// Old installs stored their data under this identifier.
const LEGACY_IDENTIFIER: &str = "eu.engazan.kimaimate";

fn legacy_settings_path(app: &tauri::AppHandle) -> Option<PathBuf> {
    let new_dir = app.path().app_data_dir().ok()?;
    let base = new_dir.parent()?;
    Some(base.join(LEGACY_IDENTIFIER).join("settings.json"))
}

fn persist_bytes_atomically(path: &Path, bytes: &[u8], overwrite: bool) -> Result<(), String> {
    let parent = path.parent().ok_or("Settings path has no parent")?;
    std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    let mut temporary = tempfile::NamedTempFile::new_in(parent).map_err(|e| e.to_string())?;
    temporary.write_all(bytes).map_err(|e| e.to_string())?;
    temporary
        .as_file_mut()
        .sync_all()
        .map_err(|e| e.to_string())?;

    if let Ok(metadata) = std::fs::metadata(path) {
        temporary
            .as_file()
            .set_permissions(metadata.permissions())
            .map_err(|e| e.to_string())?;
    }

    if overwrite {
        temporary.persist(path).map_err(|e| e.error.to_string())?;
    } else {
        temporary
            .persist_noclobber(path)
            .map_err(|e| e.error.to_string())?;
    }
    Ok(())
}

pub(crate) fn scrub_legacy_store_key(path: &Path, key: &str) -> Result<bool, String> {
    if !path.exists() {
        return Ok(false);
    }
    let bytes = std::fs::read(path).map_err(|e| e.to_string())?;
    let mut value: serde_json::Value = serde_json::from_slice(&bytes).map_err(|e| e.to_string())?;
    let Some(object) = value.as_object_mut() else {
        return Err("Legacy settings root is not an object".into());
    };
    if object.remove(key).is_none() {
        return Ok(false);
    }
    let sanitized = serde_json::to_vec(&value).map_err(|e| e.to_string())?;
    persist_bytes_atomically(path, &sanitized, true)?;
    Ok(true)
}

/// Migrate user data from the pre-rename data directory.
///
/// The store file (`settings.json`) holds connection settings, favorites,
/// hidden tasks and paused timers. Legacy versions also kept API tokens here;
/// the keychain command migrates those values to the OS credential store and
/// removes the plaintext copy after a verified secure write.
/// Tauri keys the app data dir by the bundle identifier, so renaming the
/// identifier would otherwise orphan all existing data. On first launch after
/// the update we copy the legacy `settings.json` into the new location.
///
/// Idempotent and non-destructive: it only runs when the new data dir has no
/// `settings.json` yet and the legacy one exists, and it never deletes the old
/// copy. Must run before anything reads the store (tray, shortcuts).
fn migrate_legacy_data(app: &tauri::AppHandle) {
    let Ok(new_dir) = app.path().app_data_dir() else {
        return;
    };
    let Some(old_settings) = legacy_settings_path(app) else {
        return;
    };
    let Some(old_dir) = old_settings.parent() else {
        return;
    };
    // Nothing to do for fresh installs, or if the identifier was never renamed.
    if old_dir == new_dir || !old_dir.exists() {
        return;
    }

    let new_settings = new_dir.join("settings.json");
    if new_settings.exists() || !old_settings.exists() {
        return;
    }

    if let Err(e) = std::fs::create_dir_all(&new_dir) {
        error!("data migration: failed to create {new_dir:?}: {e}");
        return;
    }
    let migrated = std::fs::read(&old_settings)
        .map_err(|e| e.to_string())
        .and_then(|bytes| {
            serde_json::from_slice::<serde_json::Value>(&bytes).map_err(|e| e.to_string())?;
            persist_bytes_atomically(&new_settings, &bytes, false)
        });
    match migrated {
        Ok(()) => info!("Migrated settings.json from legacy data directory"),
        Err(e) => error!("data migration: failed to copy settings.json: {e}"),
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let default_hook = std::panic::take_hook();
    std::panic::set_hook(Box::new(move |info| {
        let payload = if let Some(s) = info.payload().downcast_ref::<&str>() {
            s.to_string()
        } else if let Some(s) = info.payload().downcast_ref::<String>() {
            s.clone()
        } else {
            "Unknown panic".to_string()
        };
        let location = info
            .location()
            .map(|l| format!("{}:{}:{}", l.file(), l.line(), l.column()))
            .unwrap_or_else(|| "unknown".to_string());
        eprintln!("PANIC at {location}: {payload}");
        error!("PANIC at {location}: {payload}");
        default_hook(info);
    }));

    tauri::Builder::default()
        .plugin(
            tauri_plugin_log::Builder::new()
                .targets([
                    Target::new(TargetKind::Stdout),
                    Target::new(TargetKind::LogDir { file_name: None }),
                    Target::new(TargetKind::Webview),
                ])
                .level(if cfg!(debug_assertions) {
                    log::LevelFilter::Debug
                } else {
                    log::LevelFilter::Info
                })
                .level_for("tauri_plugin_updater", log::LevelFilter::Info)
                .build(),
        )
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_store::Builder::default().build())
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::LaunchAgent,
            None,
        ))
        .invoke_handler(tauri::generate_handler![
            keychain::save_api_token,
            keychain::get_api_token,
            keychain::delete_api_token,
            http::http_request,
            http::cancel_http_request,
            tray::set_tray_tooltip,
            tray::set_tray_title,
            tray::set_tray_icon,
            tray::set_tray_icon_size,
            tray::set_tray_icon_shape,
            tray::set_tray_colors,
            tray::set_popup_vibrancy,
            tray::set_popup_size,
            tray::set_popup_corner_radius,
            tray::update_tray_menu,
            tray::set_tray_click_actions,
            tray::set_display_mode,
            tray::set_always_on_top,
            tray::start_tray_ticker,
            tray::stop_tray_ticker,
            tray::list_monitors,
            tray::set_popup_monitor,
            idle::get_idle_seconds,
            shortcuts::register_shortcuts,
            store::mutate_scoped_store,
            store::mutate_array_store,
            store::patch_settings,
            store::claim_legacy_favorites_store,
            store::move_favorites_store,
            store::migrate_legacy_store,
        ])
        .setup(|app| {
            info!(
                "KimaiTray v{} starting",
                app.config().version.as_deref().unwrap_or("unknown")
            );
            // Must run before tray/shortcuts read the store.
            migrate_legacy_data(app.handle());
            tray::create_tray(app.handle())?;
            info!("System tray created");
            // Apply the "True Tray" preference (macOS): when enabled, hide the
            // app from the Dock and the Cmd+Tab switcher.
            #[cfg(target_os = "macos")]
            tray::apply_true_tray_from_store(app.handle());
            if tray::is_detached() {
                if let Some(w) = app.handle().get_webview_window("tray-popup") {
                    let _ = w.set_resizable(true);
                    let _ = w.set_always_on_top(false);
                    #[cfg(not(target_os = "linux"))]
                    let _ = w.set_skip_taskbar(false);
                    let _ = w.center();
                    let _ = w.show();
                }
            }
            shortcuts::register_from_store(app.handle());
            Ok(())
        })
        .on_window_event(|window, event| match window.label() {
            "tray-popup" => {
                if let tauri::WindowEvent::Focused(false) = event {
                    tray::on_popup_blur(window);
                }
            }
            "settings" => {
                if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                    api.prevent_close();
                    let _ = window.hide();
                }
            }
            _ => {}
        })
        .run(tauri::generate_context!())
        .unwrap_or_else(|e| {
            eprintln!("Fatal: failed to start KimaiTray: {e}");
            std::process::exit(1);
        });
}

#[cfg(test)]
mod tests {
    use super::{persist_bytes_atomically, scrub_legacy_store_key};

    #[test]
    fn atomically_scrubs_only_the_requested_legacy_credential() {
        let directory = tempfile::tempdir().unwrap();
        let path = directory.path().join("settings.json");
        persist_bytes_atomically(
            &path,
            br#"{"api-token:legacy":"secret","settings":{"theme":"dark"}}"#,
            false,
        )
        .unwrap();

        assert!(scrub_legacy_store_key(&path, "api-token:legacy").unwrap());
        let stored: serde_json::Value =
            serde_json::from_slice(&std::fs::read(path).unwrap()).unwrap();
        assert!(stored.get("api-token:legacy").is_none());
        assert_eq!(stored["settings"]["theme"], "dark");
    }
}
