#[cfg(target_os = "linux")]
use super::platform::linux::attach_appindicator_popup_activation;
#[cfg(target_os = "macos")]
use super::popup::begin_popup_activation;
use super::popup::suppress_reopen;
use super::{
    actions::{open_kimai, refresh_popup, show_settings_window},
    icons::{initial_rgba, ICON_CANVAS},
    menu::{build_tray_menu, left_click_opens_popup, right_click_opens_popup},
    popup::toggle_popup_window,
};
#[cfg(not(target_os = "linux"))]
use super::{
    platform::{position_popup, tray_scale_factor},
    popup::{
        hide_popup_window, is_detached, popup_is_visible, present_popup, restore_and_focus_popup,
    },
};
use tauri::{
    image::Image,
    tray::{MouseButton, TrayIconBuilder, TrayIconEvent},
    AppHandle,
};
#[cfg(not(target_os = "linux"))]
use tauri::{menu::Menu, tray::MouseButtonState, Manager};

pub(super) fn create_tauri_tray(app: &AppHandle) -> tauri::Result<()> {
    let right_action_popup = right_click_opens_popup();
    let menu = build_tray_menu(
        app,
        "Show/Hide",
        "Settings",
        "Open Kimai",
        "Refresh",
        "Quit",
    )?;
    let idle_icon = Image::new_owned(initial_rgba(), ICON_CANVAS as u32, ICON_CANVAS as u32);
    TrayIconBuilder::with_id("main")
        .icon(idle_icon)
        .tooltip("KimaiTray")
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_menu_event(|app, event| match event.id().as_ref() {
            "toggle_popup" => {
                toggle_popup_window(app);
            }
            "settings" => {
                show_settings_window(app);
            }
            "open_kimai" => open_kimai(app),
            "refresh" => refresh_popup(app),
            "quit" => {
                app.exit(0);
            }
            _ => {}
        })
        .on_tray_icon_event(|tray, event| {
            #[cfg(target_os = "linux")]
            {
                if let TrayIconEvent::Click { button, .. } = event {
                    let should_toggle = match button {
                        MouseButton::Left => left_click_opens_popup(),
                        MouseButton::Right => right_click_opens_popup(),
                        _ => false,
                    };
                    if should_toggle {
                        if suppress_reopen() {
                            return;
                        }
                        toggle_popup_window(tray.app_handle());
                    }
                }
            }

            #[cfg(not(target_os = "linux"))]
            {
                if let TrayIconEvent::Click {
                    button,
                    button_state,
                    rect,
                    ..
                } = event
                {
                    // In a fullscreen Space the transient macOS menu bar can
                    // stop tracking the status item before mouse-up arrives.
                    #[cfg(target_os = "macos")]
                    let trigger_state = MouseButtonState::Down;
                    #[cfg(not(target_os = "macos"))]
                    let trigger_state = MouseButtonState::Up;
                    if button_state != trigger_state {
                        return;
                    }
                    let should_toggle = match button {
                        MouseButton::Left => left_click_opens_popup(),
                        MouseButton::Right => right_click_opens_popup(),
                        _ => false,
                    };
                    #[cfg(target_os = "macos")]
                    log::debug!("Tray mouse down: button={button:?}, opens_popup={should_toggle}");
                    if should_toggle {
                        let app = tray.app_handle();
                        if let Some(popup) = app.get_webview_window("tray-popup") {
                            if popup_is_visible(&popup.as_ref().window()) {
                                if is_detached() {
                                    restore_and_focus_popup(&popup);
                                } else {
                                    hide_popup_window(&popup.as_ref().window());
                                }
                            } else {
                                if suppress_reopen() {
                                    return;
                                }
                                #[cfg(target_os = "macos")]
                                begin_popup_activation(app);
                                if !is_detached() {
                                    let _ = position_popup(&popup, &rect, tray_scale_factor(tray));
                                }
                                present_popup(&popup);
                            }
                        }
                    }
                }
            }
        })
        .build(app)?;

    #[cfg(target_os = "linux")]
    attach_appindicator_popup_activation(app)?;

    // AppIndicator needs its menu even when a saved click action requests the
    // popup: the menu is also the Linux activation bridge.
    #[cfg(target_os = "linux")]
    let _ = right_action_popup;
    #[cfg(not(target_os = "linux"))]
    if right_action_popup {
        if let Some(tray) = app.tray_by_id("main") {
            let _ = tray.set_menu(None::<Menu<tauri::Wry>>);
        }
    }

    Ok(())
}
