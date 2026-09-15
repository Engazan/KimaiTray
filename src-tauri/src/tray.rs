//! Native tray subsystem. State stays with its owning module; only startup and
//! the configuration transaction lock are shared here.
pub(crate) mod actions;
pub(crate) mod icons;
pub(crate) mod menu;
mod native;
mod platform;
pub(crate) mod popup;
pub(crate) mod ticker;

use std::sync::Mutex;
use tauri::AppHandle;
use tauri_plugin_store::StoreExt;

pub use actions::{open_kimai, show_settings_window};
#[cfg(target_os = "linux")]
pub use platform::linux::platform_tray_backend;
#[cfg(target_os = "macos")]
pub use platform::macos::apply_true_tray_from_store;
pub use popup::{
    is_detached, on_popup_focus_changed, on_popup_resize, show_popup_window, toggle_popup_window,
};

const STORE_PATH: &str = "settings.json";
// Preserve serialization across icon and native menu configuration commands.
static TRAY_CONFIGURATION: Mutex<()> = Mutex::new(());

fn validate_text(value: &str, maximum: usize, name: &str) -> Result<(), String> {
    if value.chars().count() > maximum {
        return Err(format!("{name} exceeds {maximum} characters"));
    }
    Ok(())
}

pub fn create_tray(app: &AppHandle) -> tauri::Result<()> {
    if let Ok(store) = app.store(STORE_PATH) {
        if let Some(serde_json::Value::Object(settings)) = store.get("settings") {
            icons::initialize(&settings);
            menu::initialize(&settings);
            popup::initialize(&settings);
        }
    }
    #[cfg(target_os = "linux")]
    platform::linux::create_tray(app)?;
    #[cfg(not(target_os = "linux"))]
    native::create_tauri_tray(app)?;
    ticker::start_background_ticker(app);
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::validate_text;
    #[test]
    fn native_text_inputs_are_bounded() {
        assert!(validate_text("Kimai", 5, "label").is_ok());
        assert!(validate_text("KimaiTray", 5, "label").is_err());
    }
}
