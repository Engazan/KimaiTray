use std::sync::atomic::{AtomicBool, AtomicU64, AtomicU8, Ordering};
use std::sync::Mutex;
use std::time::{Duration, SystemTime, UNIX_EPOCH};
use tauri::{
    image::Image,
    menu::{Menu, MenuBuilder, MenuItem},
    tray::{MouseButton, TrayIconBuilder, TrayIconEvent},
    AppHandle, Emitter, Manager, PhysicalPosition, WebviewWindow,
};
#[cfg(not(target_os = "linux"))]
use tauri::tray::MouseButtonState;
use tauri_plugin_opener::OpenerExt;
use tauri_plugin_store::StoreExt;

const STORE_PATH: &str = "settings.json";

// Native tray ticker — updates the menu bar title every second from a Rust thread,
// immune to macOS WebKit throttling of hidden webview JS timers.

struct TrayTickerRunning {
    begin_seconds: u64,
    project: String,
    activity: String,
    label_style: String,
    show_seconds: bool,
}

enum TrayTickerState {
    Idle,
    Running(TrayTickerRunning),
}

static TRAY_TICKER_STATE: Mutex<TrayTickerState> = Mutex::new(TrayTickerState::Idle);

fn format_elapsed(secs: u64, show_seconds: bool) -> String {
    let h = secs / 3600;
    let m = (secs % 3600) / 60;
    let s = secs % 60;
    if show_seconds {
        format!("{:02}:{:02}:{:02}", h, m, s)
    } else {
        format!("{:02}:{:02}", h, m)
    }
}

fn tick_tray(app: &AppHandle) {
    let snapshot = {
        let state = TRAY_TICKER_STATE.lock().unwrap();
        match &*state {
            TrayTickerState::Running(c) => Some((
                c.begin_seconds,
                c.project.clone(),
                c.activity.clone(),
                c.label_style.clone(),
                c.show_seconds,
            )),
            TrayTickerState::Idle => None,
        }
    };

    if let Some((begin_seconds, project, activity, label_style, show_seconds)) = snapshot {
        let now = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap_or_default()
            .as_secs();
        let secs = now.saturating_sub(begin_seconds);

        if let Some(tray) = app.tray_by_id("main") {
            let elapsed = format_elapsed(secs, true);
            let _ = tray.set_tooltip(Some(&format!("{project} — {activity} — {elapsed}")));

            if label_style == "timer" {
                let title = format_elapsed(secs, show_seconds);
                let _ = tray.set_title(Some(&title));
            }
        }
    }
}

#[tauri::command]
pub fn start_tray_ticker(
    app: AppHandle,
    begin_seconds: u64,
    project: String,
    activity: String,
    label_style: String,
    show_seconds: bool,
) -> Result<(), String> {
    {
        let mut state = TRAY_TICKER_STATE.lock().map_err(|e| e.to_string())?;
        *state = TrayTickerState::Running(TrayTickerRunning {
            begin_seconds,
            project,
            activity,
            label_style,
            show_seconds,
        });
    }
    tick_tray(&app);
    Ok(())
}

#[tauri::command]
pub fn stop_tray_ticker(app: AppHandle) -> Result<(), String> {
    let mut state = TRAY_TICKER_STATE.lock().map_err(|e| e.to_string())?;
    *state = TrayTickerState::Idle;
    drop(state);

    if let Some(tray) = app.tray_by_id("main") {
        let _ = tray.set_title(Some(""));
        let _ = tray.set_tooltip(Some("KimaiTray"));
    }
    Ok(())
}

#[tauri::command]
pub fn set_tray_tooltip(app: AppHandle, text: String) -> Result<(), String> {
    let tray = app.tray_by_id("main").ok_or("Tray icon not found")?;
    tray.set_tooltip(Some(&text)).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn set_tray_title(app: AppHandle, title: String) -> Result<(), String> {
    let tray = app.tray_by_id("main").ok_or("Tray icon not found")?;
    // Always pass Some — tray-icon's macOS impl ignores None instead of clearing
    tray.set_title(Some(&title)).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn set_tray_icon(app: AppHandle, state: String) -> Result<(), String> {
    let tray = app.tray_by_id("main").ok_or("Tray icon not found")?;
    let rgba = generate_state_icon(&state);
    let icon = Image::new_owned(rgba, 22, 22);
    tray.set_icon(Some(icon)).map_err(|e| e.to_string())
}

fn generate_state_icon(state: &str) -> Vec<u8> {
    let (r, g, b) = match state {
        "running" => (16, 185, 129),   // emerald-500
        "paused" => (245, 158, 11),    // amber-500
        "error" => (239, 68, 68),      // red-500
        _ => (156, 163, 175),          // gray-400 (idle/disconnected)
    };
    let size: usize = 22;
    let mut pixels = vec![0u8; size * size * 4];
    let center = size as f64 / 2.0;
    let radius = 5.0;
    let outline_r = 7.0;

    for y in 0..size {
        for x in 0..size {
            let dx = x as f64 - center + 0.5;
            let dy = y as f64 - center + 0.5;
            let dist = (dx * dx + dy * dy).sqrt();
            let idx = (y * size + x) * 4;

            if dist <= radius {
                pixels[idx] = r;
                pixels[idx + 1] = g;
                pixels[idx + 2] = b;
                pixels[idx + 3] = 255;
            } else if dist <= outline_r {
                let alpha = ((outline_r - dist) / (outline_r - radius) * 180.0) as u8;
                pixels[idx] = r;
                pixels[idx + 1] = g;
                pixels[idx + 2] = b;
                pixels[idx + 3] = alpha;
            }
        }
    }
    pixels
}

static LAST_POPUP_HIDE: AtomicU64 = AtomicU64::new(0);
// 0 = popup, 1 = nothing
static TRAY_LEFT_ACTION: AtomicU8 = AtomicU8::new(0);
// 0 = menu, 1 = popup
static TRAY_RIGHT_ACTION: AtomicU8 = AtomicU8::new(0);
// 0 = tray, 1 = detached
static DISPLAY_MODE: AtomicU8 = AtomicU8::new(0);

fn now_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as u64
}

pub fn on_popup_blur(window: &tauri::Window) {
    if DISPLAY_MODE.load(Ordering::SeqCst) == 1 {
        return;
    }
    LAST_POPUP_HIDE.store(now_ms(), Ordering::SeqCst);
    let _ = window.hide();
}

pub fn is_detached() -> bool {
    DISPLAY_MODE.load(Ordering::SeqCst) == 1
}

#[tauri::command]
pub fn set_display_mode(app: AppHandle, mode: String) -> Result<(), String> {
    let detached = mode == "detached";
    DISPLAY_MODE.store(if detached { 1 } else { 0 }, Ordering::SeqCst);

    let window = app
        .get_webview_window("tray-popup")
        .ok_or("Popup not found")?;

    window.set_resizable(detached).map_err(|e| e.to_string())?;
    window.set_always_on_top(!detached).map_err(|e| e.to_string())?;

    #[cfg(not(target_os = "linux"))]
    window.set_skip_taskbar(!detached).map_err(|e| e.to_string())?;

    if detached {
        let _ = window.center();
        let _ = window.show();
        let _ = window.set_focus();
    }
    Ok(())
}

#[tauri::command]
pub fn set_always_on_top(app: AppHandle, pinned: bool) -> Result<(), String> {
    let window = app
        .get_webview_window("tray-popup")
        .ok_or("Popup not found")?;
    window.set_always_on_top(pinned).map_err(|e| e.to_string())
}

fn position_popup(window: &WebviewWindow, tray_rect: &tauri::Rect) -> tauri::Result<()> {
    let scale = window.scale_factor().unwrap_or(1.0);
    let win_size = window.outer_size()?;

    let tray_pos: PhysicalPosition<i32> = tray_rect.position.to_physical(scale);
    let tray_size: tauri::PhysicalSize<i32> = tray_rect.size.to_physical(scale);

    let x = tray_pos.x + tray_size.width / 2 - win_size.width as i32 / 2;

    #[cfg(target_os = "macos")]
    let y = tray_pos.y + tray_size.height;

    #[cfg(not(target_os = "macos"))]
    let y = tray_pos.y - win_size.height as i32;

    window.set_position(PhysicalPosition::new(x, y))?;
    Ok(())
}

static VIBRANCY_APPLIED: AtomicBool = AtomicBool::new(false);

#[tauri::command]
pub fn set_popup_vibrancy(app: AppHandle, enabled: bool) -> Result<(), String> {
    let window = app
        .get_webview_window("tray-popup")
        .ok_or("Popup not found")?;

    #[cfg(target_os = "macos")]
    if enabled && !VIBRANCY_APPLIED.swap(true, Ordering::SeqCst) {
        use window_vibrancy::{apply_vibrancy, NSVisualEffectMaterial, NSVisualEffectState};
        apply_vibrancy(
            &window,
            NSVisualEffectMaterial::Popover,
            Some(NSVisualEffectState::Active),
            None,
        )
        .map_err(|e| format!("{e}"))?;
    }

    #[cfg(not(target_os = "macos"))]
    let _ = (window, enabled);

    Ok(())
}

#[tauri::command]
pub fn set_popup_size(app: AppHandle, width: f64, height: f64, zoom: f64) -> Result<(), String> {
    let window = app
        .get_webview_window("tray-popup")
        .ok_or("Popup not found")?;
    window
        .set_size(tauri::Size::Logical(tauri::LogicalSize { width, height }))
        .map_err(|e| e.to_string())?;
    window.set_zoom(zoom).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn set_popup_corner_radius(app: AppHandle, radius: f64) -> Result<(), String> {
    let window = app
        .get_webview_window("tray-popup")
        .ok_or("Popup not found")?;

    #[cfg(target_os = "macos")]
    {
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
    }

    #[cfg(not(target_os = "macos"))]
    {
        let _ = (window, radius);
    }

    Ok(())
}

#[tauri::command]
pub fn update_tray_menu(
    app: AppHandle,
    toggle_label: String,
    settings_label: String,
    open_kimai_label: String,
    refresh_label: String,
    quit_label: String,
) -> Result<(), String> {
    let tray = app.tray_by_id("main").ok_or("Tray icon not found")?;
    let menu = build_tray_menu(&app, &toggle_label, &settings_label, &open_kimai_label, &refresh_label, &quit_label)
        .map_err(|e| e.to_string())?;
    tray.set_menu(Some(menu)).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn set_tray_click_actions(
    app: AppHandle,
    left_action: String,
    right_action: String,
) -> Result<(), String> {
    let left = if left_action == "nothing" { 1u8 } else { 0u8 };
    let right = if right_action == "popup" { 1u8 } else { 0u8 };

    TRAY_LEFT_ACTION.store(left, Ordering::SeqCst);
    TRAY_RIGHT_ACTION.store(right, Ordering::SeqCst);

    let tray = app.tray_by_id("main").ok_or("Tray icon not found")?;
    if right == 1 {
        tray.set_menu(None::<Menu<tauri::Wry>>).map_err(|e| e.to_string())?;
    } else {
        let menu = build_tray_menu(&app, "Show/Hide", "Settings", "Open Kimai", "Refresh", "Quit")
            .map_err(|e| e.to_string())?;
        tray.set_menu(Some(menu)).map_err(|e| e.to_string())?;
    }

    Ok(())
}

fn build_tray_menu(
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

pub fn toggle_popup_window(app: &AppHandle) {
    if let Some(popup) = app.get_webview_window("tray-popup") {
        if popup.is_visible().unwrap_or(false) {
            if is_detached() {
                let _ = popup.set_focus();
            } else {
                let _ = popup.hide();
            }
        } else {
            if is_detached() {
                let _ = popup.show();
                let _ = popup.set_focus();
            } else {
                if let Some(tray) = app.tray_by_id("main") {
                    if let Ok(Some(rect)) = tray.rect() {
                        let _ = position_popup(&popup, &rect);
                    }
                }
                let _ = popup.show();
                let _ = popup.set_focus();
            }
        }
    }
}

pub fn show_settings_window(app: &AppHandle) {
    if let Some(w) = app.get_webview_window("settings") {
        let _ = w.show();
        let _ = w.set_focus();
    }
}

pub fn create_tray(app: &AppHandle) -> tauri::Result<()> {
    // Read initial settings from store
    let right_action_popup = if let Ok(store) = app.store(STORE_PATH) {
        if let Some(serde_json::Value::Object(s)) = store.get("settings") {
            let left = s.get("trayLeftClickAction")
                .and_then(|v| v.as_str())
                .unwrap_or("popup");
            let right = s.get("trayRightClickAction")
                .and_then(|v| v.as_str())
                .unwrap_or("menu");
            let display = s.get("displayMode")
                .and_then(|v| v.as_str())
                .unwrap_or("tray");
            TRAY_LEFT_ACTION.store(if left == "nothing" { 1 } else { 0 }, Ordering::SeqCst);
            TRAY_RIGHT_ACTION.store(if right == "popup" { 1 } else { 0 }, Ordering::SeqCst);
            DISPLAY_MODE.store(if display == "detached" { 1 } else { 0 }, Ordering::SeqCst);
            right == "popup"
        } else {
            false
        }
    } else {
        false
    };

    let toggle_i = MenuItem::with_id(app, "toggle_popup", "Show/Hide", true, None::<&str>)?;
    let settings_i = MenuItem::with_id(app, "settings", "Settings", true, None::<&str>)?;
    let open_kimai_i = MenuItem::with_id(app, "open_kimai", "Open Kimai", true, None::<&str>)?;
    let refresh_i = MenuItem::with_id(app, "refresh", "Refresh", true, None::<&str>)?;
    let quit_i = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;

    let menu = MenuBuilder::new(app)
        .item(&toggle_i)
        .separator()
        .item(&settings_i)
        .item(&open_kimai_i)
        .item(&refresh_i)
        .separator()
        .item(&quit_i)
        .build()?;

    // Start with idle icon
    let idle_icon = Image::new_owned(generate_state_icon("idle"), 22, 22);

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
            "open_kimai" => {
                let handle = app.clone();
                tauri::async_runtime::spawn(async move {
                    if let Ok(store) = handle.store(STORE_PATH) {
                        if let Some(serde_json::Value::Object(s)) = store.get("settings") {
                            if let Some(serde_json::Value::String(url)) = s.get("kimaiUrl") {
                                if !url.is_empty() {
                                    let _ = handle.opener().open_url(url, None::<&str>);
                                }
                            }
                        }
                    }
                });
            }
            "refresh" => {
                if let Some(popup) = app.get_webview_window("tray-popup") {
                    let _ = popup.emit("kimai://refresh", ());
                }
            }
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
                        MouseButton::Left => TRAY_LEFT_ACTION.load(Ordering::SeqCst) == 0,
                        MouseButton::Right => TRAY_RIGHT_ACTION.load(Ordering::SeqCst) == 1,
                        _ => false,
                    };
                    if should_toggle {
                        if now_ms() - LAST_POPUP_HIDE.load(Ordering::SeqCst) < 300 {
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
                    button_state: MouseButtonState::Up,
                    rect,
                    ..
                } = event
                {
                    let should_toggle = match button {
                        MouseButton::Left => TRAY_LEFT_ACTION.load(Ordering::SeqCst) == 0,
                        MouseButton::Right => TRAY_RIGHT_ACTION.load(Ordering::SeqCst) == 1,
                        _ => false,
                    };
                    if should_toggle {
                        let app = tray.app_handle();
                        if let Some(popup) = app.get_webview_window("tray-popup") {
                            if popup.is_visible().unwrap_or(false) {
                                if is_detached() {
                                    let _ = popup.set_focus();
                                } else {
                                    let _ = popup.hide();
                                }
                            } else {
                                if now_ms() - LAST_POPUP_HIDE.load(Ordering::SeqCst) < 300 {
                                    return;
                                }
                                if is_detached() {
                                    let _ = popup.show();
                                    let _ = popup.set_focus();
                                } else {
                                    let _ = position_popup(&popup, &rect);
                                    let _ = popup.show();
                                    let _ = popup.set_focus();
                                }
                            }
                        }
                    }
                }
            }
        })
        .build(app)?;

    // If right-click is configured to show popup, remove the attached menu
    if right_action_popup {
        if let Some(tray) = app.tray_by_id("main") {
            let _ = tray.set_menu(None::<Menu<tauri::Wry>>);
        }
    }

    // Background thread: updates tray title every second while a timer is running.
    // Runs natively so macOS cannot throttle it like webview JS timers.
    let ticker_app = app.clone();
    std::thread::spawn(move || loop {
        std::thread::sleep(Duration::from_secs(1));
        tick_tray(&ticker_app);
    });

    Ok(())
}
