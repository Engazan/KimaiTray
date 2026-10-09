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
    let tray = (tray_pos.x, tray_pos.y, tray_size.width, tray_size.height);
    let win = (win_size.width as i32, win_size.height as i32);

    // Keep the popup inside the work area (screen minus taskbar) of the
    // monitor that holds the tray icon, so icons near a screen edge do not
    // push the popup off-screen.
    let center_x = tray.0 + tray.2 / 2;
    let center_y = tray.1 + tray.3 / 2;
    let work_area = window
        .monitor_from_point(center_x as f64, center_y as f64)
        .ok()
        .flatten()
        .map(|m| {
            let area = m.work_area();
            (
                area.position.x,
                area.position.y,
                area.size.width as i32,
                area.size.height as i32,
            )
        });

    let (x, y) = popup_position_near_tray(tray, win, work_area);
    window.set_position(PhysicalPosition::new(x, y))
}

/// Compute the popup position for a tray icon. All values are physical
/// pixels; rects are `(x, y, width, height)`.
#[cfg(any(not(target_os = "macos"), test))]
fn popup_position_near_tray(
    tray: (i32, i32, i32, i32),
    win: (i32, i32),
    work_area: Option<(i32, i32, i32, i32)>,
) -> (i32, i32) {
    let (tx, ty, tw, th) = tray;
    let (ww, wh) = win;
    let x = tx + tw / 2 - ww / 2;
    let Some((ax, ay, aw, ah)) = work_area else {
        return (x, ty - wh);
    };
    // Open away from the taskbar: below the icon when it sits in the upper
    // half of the work area (top taskbar), above it otherwise.
    let y = if ty + th / 2 < ay + ah / 2 {
        ty + th
    } else {
        ty - wh
    };
    let x = x.clamp(ax, (ax + aw - ww).max(ax));
    let y = y.clamp(ay, (ay + ah - wh).max(ay));
    (x, y)
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

#[cfg(test)]
mod tests {
    use super::popup_position_near_tray;

    #[test]
    fn popup_is_clamped_to_right_edge_of_work_area() {
        // 1920x1080 screen, 48px bottom taskbar, icon near the right edge.
        let pos =
            popup_position_near_tray((1880, 1040, 24, 24), (360, 640), Some((0, 0, 1920, 1032)));
        assert_eq!(pos, (1920 - 360, 1032 - 640));
    }

    #[test]
    fn popup_is_centered_on_icon_when_it_fits() {
        let pos =
            popup_position_near_tray((1000, 1040, 24, 24), (360, 640), Some((0, 0, 1920, 1032)));
        assert_eq!(pos, (1012 - 180, 1032 - 640));
    }

    #[test]
    fn popup_opens_below_top_taskbar() {
        let pos =
            popup_position_near_tray((1880, 8, 24, 24), (360, 640), Some((0, 48, 1920, 1032)));
        assert_eq!(pos, (1560, 48));
    }

    #[test]
    fn popup_respects_secondary_monitor_offsets() {
        let pos = popup_position_near_tray(
            (3820, 1040, 24, 24),
            (360, 640),
            Some((1920, 0, 1920, 1032)),
        );
        assert_eq!(pos, (3840 - 360, 1032 - 640));
    }

    #[test]
    fn popup_falls_back_to_unclamped_position_without_monitor() {
        assert_eq!(
            popup_position_near_tray((1880, 1040, 24, 24), (360, 640), None),
            (1712, 400)
        );
    }
}
