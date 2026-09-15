use super::super::STORE_PATH;
use super::PopupInteraction;
use std::sync::atomic::{AtomicBool, Ordering};
use tauri::{AppHandle, PhysicalPosition, WebviewWindow};
use tauri_plugin_store::StoreExt;

pub(in crate::tray) fn popup_interaction(window: &tauri::Window) -> Option<PopupInteraction> {
    use objc::runtime::{Object, BOOL, NO};
    use objc::{class, msg_send, sel, sel_impl};

    let native = window.ns_window().ok()?.cast::<Object>();
    if native.is_null() {
        return None;
    }
    // Tauri owns the NSWindow; all AppKit queries run on its UI thread.
    unsafe {
        let focused: BOOL = msg_send![native, isKeyWindow];
        let resizing: BOOL = msg_send![native, inLiveResize];
        let buttons: usize = msg_send![class!(NSEvent), pressedMouseButtons];
        Some(PopupInteraction {
            focused: focused != NO,
            pointer_down: buttons & 0b111 != 0,
            resizing: resizing != NO,
        })
    }
}
/// Apply the persisted True Tray preference. When enabled, the activation
/// policy is set to `Accessory` so the app is a true
/// menu-bar app — hidden from the Dock and the Cmd+Tab switcher. When disabled
/// the default `Regular` policy is kept. Applied once at launch, so changes take
/// effect after restarting the app.
pub fn apply_true_tray_from_store(app: &AppHandle) {
    let enabled = app
        .store(STORE_PATH)
        .ok()
        .and_then(|store| store.get("settings"))
        .and_then(|v| v.as_object().cloned())
        .and_then(|s| s.get("trueTrayMode").and_then(|v| v.as_bool()))
        .unwrap_or(false);

    if enabled {
        if let Err(e) = app.set_activation_policy(tauri::ActivationPolicy::Accessory) {
            log::error!("Failed to apply True Tray activation policy: {e}");
        }
    }
}
pub(in crate::tray) fn tray_scale_factor(tray: &tauri::tray::TrayIcon<tauri::Wry>) -> Option<f64> {
    use objc::runtime::Object;
    use objc::{msg_send, sel, sel_impl};

    tray.with_inner_tray_icon(|icon| unsafe {
        let status_item = icon.ns_status_item()?;
        let status_item: *const objc2_app_kit::NSStatusItem = &*status_item;
        let status_item: *mut Object = status_item.cast_mut().cast();
        let button: *mut Object = msg_send![status_item, button];
        let window: *mut Object = msg_send![button, window];
        (!window.is_null()).then(|| msg_send![window, backingScaleFactor])
    })
    .ok()
    .flatten()
}
static VIBRANCY_APPLIED: AtomicBool = AtomicBool::new(false);

pub(in crate::tray) fn position_popup(
    window: &WebviewWindow,
    tray_rect: &tauri::Rect,
    _tray_scale: Option<f64>,
) -> tauri::Result<()> {
    if !crate::platform::supports_window_positioning() {
        return Ok(());
    }
    // macOS reports the status-item rect in physical pixels of the display
    // containing the icon, while NSWindow positions use screen points. The
    // popup can still be on another display, so its scale factor must not be
    // used to decode the tray rect.
    let tray_scale = _tray_scale.unwrap_or_else(|| window.scale_factor().unwrap_or(1.0));
    let window_scale = window.scale_factor().unwrap_or(1.0);
    let tray_pos: tauri::LogicalPosition<f64> = tray_rect.position.to_logical(tray_scale);
    let tray_size: tauri::LogicalSize<f64> = tray_rect.size.to_logical(tray_scale);
    let win_size: tauri::LogicalSize<f64> = window.outer_size()?.to_logical(window_scale);

    let x = tray_pos.x + tray_size.width / 2.0 - win_size.width / 2.0;
    let y = tray_pos.y + tray_size.height;
    let position: PhysicalPosition<i32> =
        tauri::LogicalPosition::new(x, y).to_physical(window_scale);

    window.set_position(position)
}
pub(in crate::tray) fn set_vibrancy(window: &WebviewWindow, enabled: bool) -> Result<(), String> {
    use window_vibrancy::{
        apply_vibrancy, clear_vibrancy, NSVisualEffectMaterial, NSVisualEffectState,
    };
    let applied = VIBRANCY_APPLIED.load(Ordering::SeqCst);
    if enabled && !applied {
        apply_vibrancy(
            window,
            NSVisualEffectMaterial::Popover,
            Some(NSVisualEffectState::Active),
            None,
        )
        .map_err(|e| format!("{e}"))?;
        VIBRANCY_APPLIED.store(true, Ordering::SeqCst);
    } else if !enabled && applied {
        clear_vibrancy(window).map_err(|e| format!("{e}"))?;
        VIBRANCY_APPLIED.store(false, Ordering::SeqCst);
    }

    Ok(())
}
pub(in crate::tray) fn set_corner_radius(
    window: &WebviewWindow,
    radius: f64,
) -> Result<(), String> {
    use objc::runtime::Object;
    use objc::{class, msg_send, sel, sel_impl};

    window
        .with_webview(move |wv| unsafe {
            let wk: *mut Object = wv.inner() as *mut Object;
            let ns_win: *mut Object = msg_send![wk, window];
            if ns_win.is_null() {
                return;
            }

            let clear: *mut Object = msg_send![class!(NSColor), clearColor];
            let _: () = msg_send![ns_win, setBackgroundColor: clear];
            let _: () = msg_send![ns_win, setOpaque: false];

            let cv: *mut Object = msg_send![ns_win, contentView];
            let _: () = msg_send![cv, setWantsLayer: true];
            let layer: *mut Object = msg_send![cv, layer];
            let _: () = msg_send![layer, setCornerRadius: radius];
            let _: () = msg_send![layer, setMasksToBounds: true];
        })
        .map_err(|e| format!("{e}"))?;

    Ok(())
}
