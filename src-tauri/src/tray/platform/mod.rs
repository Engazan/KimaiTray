#[cfg(any(target_os = "linux", test))]
mod backend_choice;
#[cfg(target_os = "linux")]
pub(super) mod linux;
#[cfg(target_os = "macos")]
pub(super) mod macos;
#[cfg(target_os = "windows")]
mod windows;

#[cfg(target_os = "linux")]
pub(super) use linux::popup_interaction;
#[cfg(target_os = "macos")]
pub(super) use macos::{
    popup_interaction, position_popup, set_corner_radius, set_vibrancy, tray_scale_factor,
};
#[cfg(target_os = "windows")]
pub(super) use windows::popup_interaction;

pub(super) struct PopupInteraction {
    pub(super) focused: bool,
    pub(super) pointer_down: bool,
    pub(super) resizing: bool,
}

#[cfg(not(any(target_os = "linux", target_os = "windows", target_os = "macos")))]
pub(super) fn popup_interaction(window: &tauri::Window) -> Option<PopupInteraction> {
    Some(PopupInteraction {
        focused: window.is_focused().ok()?,
        pointer_down: false,
        resizing: false,
    })
}

#[cfg(not(target_os = "macos"))]
pub(super) fn tray_scale_factor(_tray: &tauri::tray::TrayIcon<tauri::Wry>) -> Option<f64> {
    None
}

#[cfg(not(target_os = "macos"))]
pub(super) fn position_popup(
    window: &tauri::WebviewWindow,
    tray_rect: &tauri::Rect,
    _tray_scale: Option<f64>,
) -> tauri::Result<()> {
    use tauri::PhysicalPosition;
    if !crate::platform::supports_window_positioning() {
        return Ok(());
    }
    // Tauri tray rectangles and window positions are already physical on
    // Windows and Linux. Do not apply the popup window's scale a second time.
    let tray_pos: PhysicalPosition<i32> = tray_rect.position.to_physical(1.0);
    let tray_size: tauri::PhysicalSize<i32> = tray_rect.size.to_physical(1.0);
    let win_size = window.outer_size()?;

    let x = tray_pos.x + tray_size.width / 2 - win_size.width as i32 / 2;
    let y = tray_pos.y - win_size.height as i32;

    window.set_position(PhysicalPosition::new(x, y))
}

#[cfg(not(target_os = "macos"))]
pub(super) fn set_vibrancy(_window: &tauri::WebviewWindow, _enabled: bool) -> Result<(), String> {
    Ok(())
}
#[cfg(not(target_os = "macos"))]
pub(super) fn set_corner_radius(
    _window: &tauri::WebviewWindow,
    _radius: f64,
) -> Result<(), String> {
    Ok(())
}
