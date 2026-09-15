#[cfg(target_os = "linux")]
use super::platform::linux::{linux_uses_appindicator, update_legacy_menu};
use super::{validate_text, TRAY_CONFIGURATION};
use std::sync::atomic::{AtomicU8, Ordering};
use tauri::{
    menu::{Menu, MenuBuilder, MenuItem},
    AppHandle,
};

// 0 = popup, 1 = nothing
static TRAY_LEFT_ACTION: AtomicU8 = AtomicU8::new(0);
// 0 = menu, 1 = popup
static TRAY_RIGHT_ACTION: AtomicU8 = AtomicU8::new(0);
#[tauri::command]
pub fn update_tray_menu(
    app: AppHandle,
    toggle_label: String,
    settings_label: String,
    open_kimai_label: String,
    refresh_label: String,
    quit_label: String,
) -> Result<(), String> {
    for (name, label) in [
        ("Toggle label", &toggle_label),
        ("Settings label", &settings_label),
        ("Open Kimai label", &open_kimai_label),
        ("Refresh label", &refresh_label),
        ("Quit label", &quit_label),
    ] {
        validate_text(label, 128, name)?;
    }
    let _transaction = TRAY_CONFIGURATION
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner());
    #[cfg(target_os = "linux")]
    if !linux_uses_appindicator() {
        let labels = [
            toggle_label,
            settings_label,
            open_kimai_label,
            refresh_label,
            quit_label,
        ];
        return update_legacy_menu(&app, labels);
    }
    #[cfg(target_os = "linux")]
    if linux_uses_appindicator() {
        // The AppIndicator menu is only an activation bridge on desktops that
        // do not expose tray click events. Replacing it would disconnect the
        // show handler which opens the popup.
        return Ok(());
    }
    {
        let tray = app.tray_by_id("main").ok_or("Tray icon not found")?;
        let menu = build_tray_menu(
            &app,
            &toggle_label,
            &settings_label,
            &open_kimai_label,
            &refresh_label,
            &quit_label,
        )
        .map_err(|e| e.to_string())?;
        tray.set_menu(Some(menu)).map_err(|e| e.to_string())
    }
}

#[tauri::command]
pub fn set_tray_click_actions(
    app: AppHandle,
    left_action: String,
    right_action: String,
) -> Result<(), String> {
    if !matches!(left_action.as_str(), "popup" | "nothing") {
        return Err("Invalid left-click action".into());
    }
    if !matches!(right_action.as_str(), "menu" | "popup") {
        return Err("Invalid right-click action".into());
    }
    let left = if left_action == "nothing" { 1u8 } else { 0u8 };
    let right = if right_action == "popup" { 1u8 } else { 0u8 };
    let _transaction = TRAY_CONFIGURATION
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner());
    #[cfg(not(target_os = "linux"))]
    let configure_native_menu = true;
    #[cfg(target_os = "linux")]
    let configure_native_menu = false;
    if configure_native_menu {
        let tray = app.tray_by_id("main").ok_or("Tray icon not found")?;
        if right == 1 {
            tray.set_menu(None::<Menu<tauri::Wry>>)
                .map_err(|e| e.to_string())?;
        } else {
            let menu = build_tray_menu(
                &app,
                "Show/Hide",
                "Settings",
                "Open Kimai",
                "Refresh",
                "Quit",
            )
            .map_err(|e| e.to_string())?;
            tray.set_menu(Some(menu)).map_err(|e| e.to_string())?;
        }
    }

    TRAY_LEFT_ACTION.store(left, Ordering::SeqCst);
    TRAY_RIGHT_ACTION.store(right, Ordering::SeqCst);

    Ok(())
}

pub(super) fn build_tray_menu(
    app: &AppHandle,
    toggle_label: &str,
    settings_label: &str,
    open_kimai_label: &str,
    refresh_label: &str,
    quit_label: &str,
) -> tauri::Result<tauri::menu::Menu<tauri::Wry>> {
    let toggle_i = MenuItem::with_id(app, "toggle_popup", toggle_label, true, None::<&str>)?;
    let settings_i = MenuItem::with_id(app, "settings", settings_label, true, None::<&str>)?;
    let open_kimai_i = MenuItem::with_id(app, "open_kimai", open_kimai_label, true, None::<&str>)?;
    let refresh_i = MenuItem::with_id(app, "refresh", refresh_label, true, None::<&str>)?;
    let quit_i = MenuItem::with_id(app, "quit", quit_label, true, None::<&str>)?;

    MenuBuilder::new(app)
        .item(&toggle_i)
        .separator()
        .item(&settings_i)
        .item(&open_kimai_i)
        .item(&refresh_i)
        .separator()
        .item(&quit_i)
        .build()
}

pub(super) fn left_click_opens_popup() -> bool {
    TRAY_LEFT_ACTION.load(Ordering::SeqCst) == 0
}
pub(super) fn right_click_opens_popup() -> bool {
    TRAY_RIGHT_ACTION.load(Ordering::SeqCst) == 1
}

pub(super) fn initialize(settings: &serde_json::Map<String, serde_json::Value>) {
    let left = settings
        .get("trayLeftClickAction")
        .and_then(|v| v.as_str())
        .unwrap_or("popup");
    let right = settings
        .get("trayRightClickAction")
        .and_then(|v| v.as_str())
        .unwrap_or("menu");
    TRAY_LEFT_ACTION.store(if left == "nothing" { 1 } else { 0 }, Ordering::SeqCst);
    TRAY_RIGHT_ACTION.store(if right == "popup" { 1 } else { 0 }, Ordering::SeqCst);
}
