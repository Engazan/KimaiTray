#[cfg(target_os = "linux")]
use super::platform::linux::{linux_uses_appindicator, position_legacy_popup};
#[cfg(target_os = "macos")]
use super::platform::macos::apply_true_tray_from_store;
use super::platform::{popup_interaction, position_popup, tray_scale_factor};
use std::sync::atomic::{AtomicU64, AtomicU8, Ordering};
use std::time::{Duration, SystemTime, UNIX_EPOCH};
use tauri::{AppHandle, Manager, PhysicalPosition, WebviewWindow};

static LAST_POPUP_HIDE: AtomicU64 = AtomicU64::new(0);
static POPUP_FOCUS_GENERATION: AtomicU64 = AtomicU64::new(0);
static LAST_POPUP_RESIZE: AtomicU64 = AtomicU64::new(0);
// 0 = tray, 1 = detached
static DISPLAY_MODE: AtomicU8 = AtomicU8::new(0);
// 0 = active monitor, 1 = specific monitor (Linux only)
static POPUP_MONITOR_MODE: AtomicU8 = AtomicU8::new(0);
// index of the monitor to use in specific mode
static POPUP_MONITOR_INDEX: AtomicU8 = AtomicU8::new(0);
// 0=bottom-right, 1=bottom-left, 2=top-right, 3=top-left, 4=center
static POPUP_MONITOR_POS: AtomicU8 = AtomicU8::new(0);
fn now_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as u64
}

#[derive(Debug, PartialEq)]
enum PopupBlurAction {
    KeepOpen,
    Wait,
    Hide,
}

fn popup_blur_action(
    focused: bool,
    pointer_down: bool,
    resizing: bool,
    since_resize_ms: u64,
) -> PopupBlurAction {
    if focused {
        PopupBlurAction::KeepOpen
    } else if pointer_down || resizing || since_resize_ms < 250 {
        PopupBlurAction::Wait
    } else {
        PopupBlurAction::Hide
    }
}

pub fn on_popup_resize() {
    LAST_POPUP_RESIZE.store(now_ms(), Ordering::SeqCst);
}

fn recheck_popup_blur(window: &tauri::Window, generation: u64) -> bool {
    if POPUP_FOCUS_GENERATION.load(Ordering::SeqCst) != generation
        || is_detached()
        || !window.is_visible().unwrap_or(false)
    {
        return false;
    }
    let Some(interaction) = popup_interaction(window) else {
        return false;
    };
    match popup_blur_action(
        interaction.focused,
        interaction.pointer_down,
        interaction.resizing,
        now_ms().saturating_sub(LAST_POPUP_RESIZE.load(Ordering::SeqCst)),
    ) {
        // Child-window focus events can disagree with native foreground focus.
        // Keep watching for a real click away unless a focus-in event cancels us.
        PopupBlurAction::KeepOpen | PopupBlurAction::Wait => true,
        PopupBlurAction::Hide => {
            LAST_POPUP_HIDE.store(now_ms(), Ordering::SeqCst);
            let _ = window.hide();
            false
        }
    }
}

pub fn on_popup_focus_changed(window: &tauri::Window, focused: bool) {
    let generation = POPUP_FOCUS_GENERATION.fetch_add(1, Ordering::SeqCst) + 1;
    if focused || is_detached() {
        return;
    }
    let window = window.clone();
    tauri::async_runtime::spawn(async move {
        loop {
            tokio::time::sleep(Duration::from_millis(100)).await;
            if POPUP_FOCUS_GENERATION.load(Ordering::SeqCst) != generation {
                break;
            }
            let (sender, receiver) = tokio::sync::oneshot::channel();
            let handle = window.clone();
            if window
                .run_on_main_thread(move || {
                    let _ = sender.send(recheck_popup_blur(&handle, generation));
                })
                .is_err()
            {
                break;
            }
            if !receiver.await.unwrap_or(false) {
                break;
            }
        }
    });
}

pub fn is_detached() -> bool {
    DISPLAY_MODE.load(Ordering::SeqCst) == 1
}

pub(super) fn restore_and_focus_popup(popup: &WebviewWindow) {
    // Focusing an iconified window is a no-op on several Linux compositors.
    // Restore it first so a detached popup can always be recovered from tray.
    let _ = popup.unminimize();
    let _ = popup.set_focus();
}

#[tauri::command]
pub fn set_display_mode(app: AppHandle, mode: String) -> Result<(), String> {
    let detached = mode == "detached";
    DISPLAY_MODE.store(if detached { 1 } else { 0 }, Ordering::SeqCst);

    let window = app
        .get_webview_window("tray-popup")
        .ok_or("Popup not found")?;

    if detached {
        // Detached windows should be freely resizable. Tray mode restores
        // the bounded width and height constraints in set_popup_size.
        window
            .set_min_size(None::<tauri::Size>)
            .map_err(|e| e.to_string())?;
        window
            .set_max_size(None::<tauri::Size>)
            .map_err(|e| e.to_string())?;
    }

    window.set_resizable(true).map_err(|e| e.to_string())?;
    if crate::platform::supports_always_on_top() {
        window
            .set_always_on_top(!detached)
            .map_err(|e| e.to_string())?;
    }

    #[cfg(not(target_os = "linux"))]
    window
        .set_skip_taskbar(!detached)
        .map_err(|e| e.to_string())?;

    if detached {
        let _ = window.center();
        let _ = window.show();
        restore_and_focus_popup(&window);
    }
    Ok(())
}

#[tauri::command]
pub fn set_always_on_top(app: AppHandle, pinned: bool) -> Result<(), String> {
    if !crate::platform::supports_always_on_top() {
        return Ok(());
    }
    let window = app
        .get_webview_window("tray-popup")
        .ok_or("Popup not found")?;
    window.set_always_on_top(pinned).map_err(|e| e.to_string())
}
/// Position the popup on a specific monitor at the given corner/center.
/// `pos`: 0=bottom-right, 1=bottom-left, 2=top-right, 3=top-left, 4=center
pub(super) fn position_on_monitor(
    window: &WebviewWindow,
    monitor_index: u8,
    pos: u8,
) -> tauri::Result<()> {
    if !crate::platform::supports_window_positioning() {
        return Ok(());
    }
    let monitors = window.available_monitors()?;
    let win_size = window.outer_size()?;
    const MARGIN: i32 = 8;

    let monitor = monitors
        .get(monitor_index as usize)
        .or_else(|| {
            monitors.iter().find(|m| {
                window
                    .primary_monitor()
                    .ok()
                    .flatten()
                    .as_ref()
                    .map(|p| p.name() == m.name())
                    .unwrap_or(false)
            })
        })
        .or_else(|| monitors.first());

    let monitor = match monitor {
        Some(m) => m,
        None => return Ok(()),
    };

    let mon_pos = monitor.position();
    let mon_size = monitor.size();

    let x = match pos {
        1 | 3 => mon_pos.x + MARGIN, // left
        4 => mon_pos.x + (mon_size.width as i32 - win_size.width as i32) / 2, // center-x
        _ => mon_pos.x + mon_size.width as i32 - win_size.width as i32 - MARGIN, // right (0, 2)
    };

    let y = match pos {
        2 | 3 => mon_pos.y + MARGIN, // top
        4 => mon_pos.y + (mon_size.height as i32 - win_size.height as i32) / 2, // center-y
        _ => mon_pos.y + mon_size.height as i32 - win_size.height as i32 - MARGIN, // bottom (0, 1)
    };

    window.set_position(PhysicalPosition::new(x, y))?;
    Ok(())
}

#[derive(serde::Serialize)]
pub struct MonitorInfo {
    pub index: usize,
    pub name: String,
    pub primary: bool,
}

#[tauri::command]
pub fn list_monitors(app: AppHandle) -> Result<Vec<MonitorInfo>, String> {
    let window = app
        .get_webview_window("tray-popup")
        .ok_or("Popup not found")?;
    let monitors = window.available_monitors().map_err(|e| e.to_string())?;
    let primary_name = window
        .primary_monitor()
        .ok()
        .flatten()
        .and_then(|m| m.name().map(|n| n.to_string()));
    Ok(monitors
        .iter()
        .enumerate()
        .map(|(i, m)| {
            let name = m
                .name()
                .map(|n| n.to_string())
                .unwrap_or_else(|| format!("Monitor {}", i + 1));
            let primary = primary_name.as_deref() == m.name().map(|x| x.as_str());
            MonitorInfo {
                index: i,
                name,
                primary,
            }
        })
        .collect())
}

#[tauri::command]
pub fn set_popup_monitor(mode: String, index: u8, position: String) -> Result<(), String> {
    POPUP_MONITOR_MODE.store(if mode == "specific" { 1 } else { 0 }, Ordering::SeqCst);
    POPUP_MONITOR_INDEX.store(index, Ordering::SeqCst);
    let pos_code: u8 = match position.as_str() {
        "bottom-left" => 1,
        "top-right" => 2,
        "top-left" => 3,
        "center" => 4,
        _ => 0, // bottom-right default
    };
    POPUP_MONITOR_POS.store(pos_code, Ordering::SeqCst);
    Ok(())
}
fn validate_popup_geometry(width: f64, height: f64, zoom: f64) -> Result<(), String> {
    if !zoom.is_finite() || !(0.5..=2.5).contains(&zoom) {
        return Err("Popup zoom must be between 0.5 and 2.5".into());
    }
    if !width.is_finite() || !(300.0 * zoom..=1000.0 * zoom).contains(&width) {
        return Err("Popup width must be between 300 and 1000".into());
    }
    if !height.is_finite() || !(320.0 * zoom..=1200.0 * zoom).contains(&height) {
        return Err("Popup height must be between 320 and 1200".into());
    }
    Ok(())
}

fn validate_popup_zoom(zoom: f64) -> Result<(), String> {
    if !zoom.is_finite() || !(0.5..=2.5).contains(&zoom) {
        return Err("Popup zoom must be between 0.5 and 2.5".into());
    }
    Ok(())
}

#[tauri::command]
pub fn set_popup_size(app: AppHandle, width: f64, height: f64, zoom: f64) -> Result<(), String> {
    validate_popup_geometry(width, height, zoom)?;
    let window = app
        .get_webview_window("tray-popup")
        .ok_or("Popup not found")?;
    let size = tauri::Size::Logical(tauri::LogicalSize { width, height });

    // Allow width and height resizing within bounds scaled by the UI zoom.
    let min_size = tauri::Size::Logical(tauri::LogicalSize {
        width: 300.0 * zoom,
        height: 320.0 * zoom,
    });
    let max_size = tauri::Size::Logical(tauri::LogicalSize {
        width: 1000.0 * zoom,
        height: 1200.0 * zoom,
    });
    window.set_resizable(true).map_err(|e| e.to_string())?;
    window
        .set_min_size(Some(min_size))
        .map_err(|e| e.to_string())?;
    window
        .set_max_size(Some(max_size))
        .map_err(|e| e.to_string())?;

    window.set_size(size).map_err(|e| e.to_string())?;
    window.set_zoom(zoom).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn set_popup_zoom(app: AppHandle, zoom: f64) -> Result<(), String> {
    validate_popup_zoom(zoom)?;
    let window = app
        .get_webview_window("tray-popup")
        .ok_or("Popup not found")?;
    window.set_zoom(zoom).map_err(|e| e.to_string())
}

pub fn show_popup_window(app: &AppHandle) {
    // Launching a custom protocol activates the application as a regular macOS
    // app after setup has already applied the persisted policy. Reassert it
    // immediately before showing/focusing the popup so a True Tray launch does
    // not leak KimaiTray into the Dock or Cmd+Tab switcher.
    #[cfg(target_os = "macos")]
    apply_true_tray_from_store(app);

    if let Some(popup) = app.get_webview_window("tray-popup") {
        if popup.is_visible().unwrap_or(false) {
            restore_and_focus_popup(&popup);
        } else if is_detached() {
            let _ = popup.show();
            restore_and_focus_popup(&popup);
        } else {
            if POPUP_MONITOR_MODE.load(Ordering::SeqCst) == 1 {
                let idx = POPUP_MONITOR_INDEX.load(Ordering::SeqCst);
                let pos = POPUP_MONITOR_POS.load(Ordering::SeqCst);
                let _ = position_on_monitor(&popup, idx, pos);
            } else {
                #[cfg(target_os = "linux")]
                if linux_uses_appindicator() {
                    if let Some(tray) = app.tray_by_id("main") {
                        if let Ok(Some(rect)) = tray.rect() {
                            let _ = position_popup(&popup, &rect, tray_scale_factor(&tray));
                        }
                    }
                } else {
                    let _ = position_legacy_popup(&popup);
                }

                #[cfg(not(target_os = "linux"))]
                if let Some(tray) = app.tray_by_id("main") {
                    if let Ok(Some(rect)) = tray.rect() {
                        let _ = position_popup(&popup, &rect, tray_scale_factor(&tray));
                    }
                }
            }
            let _ = popup.show();
            restore_and_focus_popup(&popup);
        }
    }
}

pub fn toggle_popup_window(app: &AppHandle) {
    if let Some(popup) = app.get_webview_window("tray-popup") {
        if popup.is_visible().unwrap_or(false) {
            if is_detached() {
                restore_and_focus_popup(&popup);
            } else {
                let _ = popup.hide();
            }
        } else {
            show_popup_window(app);
        }
    }
}

pub(super) fn suppress_reopen() -> bool {
    now_ms().saturating_sub(LAST_POPUP_HIDE.load(Ordering::SeqCst)) < 300
}

pub(super) fn initialize(settings: &serde_json::Map<String, serde_json::Value>) {
    let display = settings
        .get("displayMode")
        .and_then(|v| v.as_str())
        .unwrap_or("tray");
    DISPLAY_MODE.store(if display == "detached" { 1 } else { 0 }, Ordering::SeqCst);
    let mode = settings
        .get("popupMonitorMode")
        .and_then(|v| v.as_str())
        .unwrap_or("active");
    let position = settings
        .get("popupMonitorPosition")
        .and_then(|v| v.as_str())
        .unwrap_or("bottom-right");
    let index = settings
        .get("popupMonitorIndex")
        .and_then(|v| v.as_u64())
        .unwrap_or(0) as u8;
    let _ = set_popup_monitor(mode.to_owned(), index, position.to_owned());
}

#[tauri::command]
pub fn set_popup_vibrancy(app: AppHandle, enabled: bool) -> Result<(), String> {
    let window = app
        .get_webview_window("tray-popup")
        .ok_or("Popup not found")?;
    super::platform::set_vibrancy(&window, enabled)
}

#[tauri::command]
pub fn set_popup_corner_radius(app: AppHandle, radius: f64) -> Result<(), String> {
    if !radius.is_finite() || !(0.0..=64.0).contains(&radius) {
        return Err("Corner radius must be between 0 and 64".into());
    }
    let window = app
        .get_webview_window("tray-popup")
        .ok_or("Popup not found")?;
    super::platform::set_corner_radius(&window, radius)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn popup_survives_transient_focus_loss_during_pointer_and_resize_grabs() {
        assert_eq!(
            popup_blur_action(true, false, false, 1_000),
            PopupBlurAction::KeepOpen
        );
        assert_eq!(
            popup_blur_action(false, true, false, 1_000),
            PopupBlurAction::Wait
        );
        assert_eq!(
            popup_blur_action(false, false, false, 0),
            PopupBlurAction::Wait
        );
        assert_eq!(
            popup_blur_action(false, false, false, 249),
            PopupBlurAction::Wait
        );
        assert_eq!(
            popup_blur_action(false, false, false, 250),
            PopupBlurAction::Hide
        );
    }
    #[test]
    fn keyboard_resize_waits_even_without_mouse_buttons_or_recent_resize_events() {
        assert_eq!(
            popup_blur_action(false, false, true, 30_000),
            PopupBlurAction::Wait
        );
        assert_eq!(
            popup_blur_action(false, false, false, 10),
            PopupBlurAction::Wait
        );
        assert_eq!(
            popup_blur_action(true, false, false, 300),
            PopupBlurAction::KeepOpen
        );
    }
    #[test]
    fn real_focus_loss_dismisses_after_the_pointer_is_released() {
        assert_eq!(
            popup_blur_action(false, true, false, 30_000),
            PopupBlurAction::Wait
        );
        assert_eq!(
            popup_blur_action(false, false, false, 30_000),
            PopupBlurAction::Hide
        );
    }
    #[test]
    fn popup_geometry_accepts_supported_values() {
        assert!(validate_popup_geometry(360.0, 640.0, 1.0).is_ok());
        assert!(validate_popup_geometry(576.0, 1920.0, 1.6).is_ok());
        assert!(validate_popup_geometry(255.0, 544.0, 0.85).is_ok());
        assert!(validate_popup_geometry(1600.0, 1920.0, 1.6).is_ok());
    }
    #[test]
    fn popup_geometry_rejects_non_finite_and_extreme_values() {
        assert!(validate_popup_geometry(f64::NAN, 640.0, 1.0).is_err());
        assert!(validate_popup_geometry(360.0, f64::INFINITY, 1.0).is_err());
        assert!(validate_popup_geometry(360.0, 640.0, 10.0).is_err());
        assert!(validate_popup_geometry(299.0, 640.0, 1.0).is_err());
        assert!(validate_popup_geometry(1601.0, 1920.0, 1.6).is_err());
    }
}
