#[cfg(target_os = "macos")]
use std::sync::atomic::AtomicBool;
use std::sync::atomic::{AtomicU32, AtomicU64, AtomicU8, Ordering};
use std::sync::Mutex;
use std::time::{Duration, SystemTime, UNIX_EPOCH};
#[cfg(not(target_os = "linux"))]
use tauri::tray::MouseButtonState;
use tauri::{
    image::Image,
    menu::{Menu, MenuBuilder, MenuItem},
    tray::{MouseButton, TrayIconBuilder, TrayIconEvent},
    AppHandle, Emitter, Manager, PhysicalPosition, WebviewWindow,
};
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
static TRAY_CONFIGURATION: Mutex<()> = Mutex::new(());

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

fn tray_label_title(
    label_style: &str,
    project: &str,
    activity: &str,
    elapsed_seconds: u64,
    show_seconds: bool,
) -> String {
    match label_style {
        "timer" => format_elapsed(elapsed_seconds, show_seconds),
        "project" => project.to_owned(),
        "activity" => activity.to_owned(),
        _ => String::new(),
    }
}

fn tick_tray(app: &AppHandle) {
    let snapshot = {
        let state = TRAY_TICKER_STATE
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner());
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

            let title = tray_label_title(&label_style, &project, &activity, secs, show_seconds);
            let _ = tray.set_title(Some(&title));
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
    validate_text(&project, 256, "Project")?;
    validate_text(&activity, 256, "Activity")?;
    if !matches!(
        label_style.as_str(),
        "timer" | "project" | "activity" | "hidden"
    ) {
        return Err("Invalid tray label style".into());
    }
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
    validate_text(&text, 768, "Tray tooltip")?;
    let tray = app.tray_by_id("main").ok_or("Tray icon not found")?;
    tray.set_tooltip(Some(&text)).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn set_tray_title(app: AppHandle, title: String) -> Result<(), String> {
    validate_text(&title, 256, "Tray title")?;
    let tray = app.tray_by_id("main").ok_or("Tray icon not found")?;
    // Always pass Some — tray-icon's macOS impl ignores None instead of clearing
    tray.set_title(Some(&title)).map_err(|e| e.to_string())
}

// 0 = idle, 1 = running, 2 = paused, 3 = error — remembers the current dot color
// so a size/shape change can re-render without the frontend re-sending the state.
static TRAY_ICON_STATE: AtomicU8 = AtomicU8::new(0);
// 0 = small, 1 = medium, 2 = large
static TRAY_ICON_SIZE: AtomicU8 = AtomicU8::new(1);
// 0 = dot, 1 = ring, 2 = square, 3 = clock
static TRAY_ICON_SHAPE: AtomicU8 = AtomicU8::new(0);

// Per-state icon colors, packed as 0x00RRGGBB. Indexed by state code
// (0 = idle, 1 = running, 2 = paused, 3 = error). Defaults mirror the
// Tailwind palette used before colors were user-configurable.
static TRAY_COLORS: [AtomicU32; 4] = [
    AtomicU32::new(0x9c_a3_af), // gray-400 (idle/disconnected)
    AtomicU32::new(0x10_b9_81), // emerald-500 (running)
    AtomicU32::new(0xf5_9e_0b), // amber-500 (paused)
    AtomicU32::new(0xef_44_44), // red-500 (error)
];

// The tray icon is drawn at a high pixel resolution and downscaled by the OS
// (macOS pins the menu-bar image to 18pt height), so a Retina display has enough
// pixels to render the dot crisply instead of upscaling a tiny bitmap.
const ICON_CANVAS: usize = 44;

fn state_code(state: &str) -> u8 {
    match state {
        "running" => 1,
        "paused" => 2,
        "error" => 3,
        _ => 0,
    }
}

fn validate_text(value: &str, maximum: usize, name: &str) -> Result<(), String> {
    if value.chars().count() > maximum {
        return Err(format!("{name} exceeds {maximum} characters"));
    }
    Ok(())
}

fn size_code(size: &str) -> u8 {
    match size {
        "small" => 0,
        "large" => 2,
        "xlarge" => 3,
        _ => 1, // medium
    }
}

fn shape_code(shape: &str) -> u8 {
    match shape {
        "ring" => 1,
        "square" => 2,
        "clock" => 3,
        _ => 0, // dot
    }
}

fn render_icon(app: &AppHandle, size: u8, shape: u8, color: Rgb) -> Result<(), String> {
    let tray = app.tray_by_id("main").ok_or("Tray icon not found")?;
    let rgba = generate_state_icon_with_color(size, shape, color);
    let icon = Image::new_owned(rgba, ICON_CANVAS as u32, ICON_CANVAS as u32);
    tray.set_icon(Some(icon)).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn set_tray_icon(app: AppHandle, state: String) -> Result<(), String> {
    if !matches!(state.as_str(), "idle" | "running" | "paused" | "error") {
        return Err("Invalid tray icon state".into());
    }
    let _transaction = TRAY_CONFIGURATION
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner());
    let next = state_code(&state);
    render_icon(
        &app,
        TRAY_ICON_SIZE.load(Ordering::SeqCst),
        TRAY_ICON_SHAPE.load(Ordering::SeqCst),
        state_color(next),
    )?;
    TRAY_ICON_STATE.store(next, Ordering::SeqCst);
    Ok(())
}

#[tauri::command]
pub fn set_tray_icon_size(app: AppHandle, size: String) -> Result<(), String> {
    if !matches!(size.as_str(), "small" | "medium" | "large" | "xlarge") {
        return Err("Invalid tray icon size".into());
    }
    let _transaction = TRAY_CONFIGURATION
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner());
    let next = size_code(&size);
    let state = TRAY_ICON_STATE.load(Ordering::SeqCst);
    render_icon(
        &app,
        next,
        TRAY_ICON_SHAPE.load(Ordering::SeqCst),
        state_color(state),
    )?;
    TRAY_ICON_SIZE.store(next, Ordering::SeqCst);
    Ok(())
}

#[tauri::command]
pub fn set_tray_icon_shape(app: AppHandle, shape: String) -> Result<(), String> {
    if !matches!(shape.as_str(), "dot" | "ring" | "square" | "clock") {
        return Err("Invalid tray icon shape".into());
    }
    let _transaction = TRAY_CONFIGURATION
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner());
    let next = shape_code(&shape);
    let state = TRAY_ICON_STATE.load(Ordering::SeqCst);
    render_icon(
        &app,
        TRAY_ICON_SIZE.load(Ordering::SeqCst),
        next,
        state_color(state),
    )?;
    TRAY_ICON_SHAPE.store(next, Ordering::SeqCst);
    Ok(())
}

#[tauri::command]
pub fn set_tray_colors(
    app: AppHandle,
    idle: String,
    running: String,
    paused: String,
    error: String,
) -> Result<(), String> {
    let parsed = [idle, running, paused, error]
        .iter()
        .map(|hex| parse_hex_color(hex).ok_or_else(|| format!("Invalid tray color: {hex}")))
        .collect::<Result<Vec<_>, _>>()?;
    let _transaction = TRAY_CONFIGURATION
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner());
    let state = TRAY_ICON_STATE.load(Ordering::SeqCst);
    render_icon(
        &app,
        TRAY_ICON_SIZE.load(Ordering::SeqCst),
        TRAY_ICON_SHAPE.load(Ordering::SeqCst),
        unpack_color(parsed[state.min(3) as usize]),
    )?;
    for (idx, packed) in parsed.into_iter().enumerate() {
        TRAY_COLORS[idx].store(packed, Ordering::SeqCst);
    }
    Ok(())
}

type Rgb = (f64, f64, f64);

fn state_color(state: u8) -> Rgb {
    let packed = TRAY_COLORS[state.min(3) as usize].load(Ordering::SeqCst);
    unpack_color(packed)
}

fn unpack_color(packed: u32) -> Rgb {
    (
        ((packed >> 16) & 0xff) as f64,
        ((packed >> 8) & 0xff) as f64,
        (packed & 0xff) as f64,
    )
}

/// Parse a `#RRGGBB` (or `RRGGBB`) hex string into a packed 0x00RRGGBB value.
fn parse_hex_color(s: &str) -> Option<u32> {
    let hex = s.strip_prefix('#').unwrap_or(s);
    if hex.len() != 6 {
        return None;
    }
    u32::from_str_radix(hex, 16).ok()
}

fn size_radius(size: u8) -> f64 {
    match size {
        0 => 8.5,  // small
        2 => 13.5, // large
        3 => 16.5, // extra large
        _ => 10.5, // medium
    }
}

/// Shortest distance from point `p` to the line segment `a`–`b`.
fn dist_to_segment(px: f64, py: f64, ax: f64, ay: f64, bx: f64, by: f64) -> f64 {
    let (abx, aby) = (bx - ax, by - ay);
    let (apx, apy) = (px - ax, py - ay);
    let len2 = abx * abx + aby * aby;
    let t = if len2 > 0.0 {
        ((apx * abx + apy * aby) / len2).clamp(0.0, 1.0)
    } else {
        0.0
    };
    let (cx, cy) = (ax + abx * t, ay + aby * t);
    ((px - cx).powi(2) + (py - cy).powi(2)).sqrt()
}

/// Write a color at `coverage` (0..1) over whatever is already in the pixel,
/// keeping the strongest alpha so overlapping strokes merge cleanly.
fn blend_pixel(pixels: &mut [u8], idx: usize, color: Rgb, coverage: f64) {
    if coverage <= 0.0 {
        return;
    }
    let a = (coverage * 255.0) as u8;
    if a >= pixels[idx + 3] {
        pixels[idx] = color.0 as u8;
        pixels[idx + 1] = color.1 as u8;
        pixels[idx + 2] = color.2 as u8;
        pixels[idx + 3] = a;
    }
}

fn generate_state_icon(state: u8, size: u8, shape: u8) -> Vec<u8> {
    generate_state_icon_with_color(size, shape, state_color(state))
}

fn generate_state_icon_with_color(size: u8, shape: u8, color: Rgb) -> Vec<u8> {
    let radius = size_radius(size);
    match shape {
        1 => draw_ring(color, radius),
        2 => draw_square(color, radius),
        3 => draw_clock(color, radius),
        _ => draw_dot(color, radius),
    }
}

/// Filled disc with a slightly darker rim for a crisp, high-contrast edge.
fn draw_dot(color: Rgb, radius: f64) -> Vec<u8> {
    let rim_width = 1.4;
    let rim = (color.0 * 0.62, color.1 * 0.62, color.2 * 0.62);
    let canvas = ICON_CANVAS;
    let mut pixels = vec![0u8; canvas * canvas * 4];
    let center = canvas as f64 / 2.0;
    let fill_radius = radius - rim_width;

    for y in 0..canvas {
        for x in 0..canvas {
            let dx = x as f64 - center + 0.5;
            let dy = y as f64 - center + 0.5;
            let dist = (dx * dx + dy * dy).sqrt();
            let idx = (y * canvas + x) * 4;

            let outer = (radius + 0.5 - dist).clamp(0.0, 1.0);
            if outer <= 0.0 {
                continue;
            }
            let fill = (fill_radius + 0.5 - dist).clamp(0.0, 1.0);
            let ring = outer - fill;
            let c = (
                (color.0 * fill + rim.0 * ring) / outer,
                (color.1 * fill + rim.1 * ring) / outer,
                (color.2 * fill + rim.2 * ring) / outer,
            );
            blend_pixel(&mut pixels, idx, c, outer);
        }
    }
    pixels
}

/// Hollow ring (outline circle).
fn draw_ring(color: Rgb, radius: f64) -> Vec<u8> {
    let inner = radius * 0.52;
    let canvas = ICON_CANVAS;
    let mut pixels = vec![0u8; canvas * canvas * 4];
    let center = canvas as f64 / 2.0;

    for y in 0..canvas {
        for x in 0..canvas {
            let dx = x as f64 - center + 0.5;
            let dy = y as f64 - center + 0.5;
            let dist = (dx * dx + dy * dy).sqrt();
            let idx = (y * canvas + x) * 4;

            let outer = (radius + 0.5 - dist).clamp(0.0, 1.0);
            let hole = (dist - inner + 0.5).clamp(0.0, 1.0);
            let cov = outer.min(hole);
            blend_pixel(&mut pixels, idx, color, cov);
        }
    }
    pixels
}

/// Rounded square (squircle) with a darker rim.
fn draw_square(color: Rgb, radius: f64) -> Vec<u8> {
    let half = radius * 0.94;
    let corner = radius * 0.42;
    let rim_width = 1.4;
    let rim = (color.0 * 0.62, color.1 * 0.62, color.2 * 0.62);
    let canvas = ICON_CANVAS;
    let mut pixels = vec![0u8; canvas * canvas * 4];
    let center = canvas as f64 / 2.0;
    let b = half - corner; // inner box half-extent

    for y in 0..canvas {
        for x in 0..canvas {
            let dx = (x as f64 - center + 0.5).abs();
            let dy = (y as f64 - center + 0.5).abs();
            let idx = (y * canvas + x) * 4;

            // Signed distance to a rounded box (negative inside).
            let qx = dx - b;
            let qy = dy - b;
            let outside = (qx.max(0.0).powi(2) + qy.max(0.0).powi(2)).sqrt();
            let inside = qx.max(qy).min(0.0);
            let sdf = outside + inside - corner;

            let outer = (0.5 - sdf).clamp(0.0, 1.0);
            if outer <= 0.0 {
                continue;
            }
            let fill = (0.5 - (sdf + rim_width)).clamp(0.0, 1.0);
            let ring = outer - fill;
            let c = (
                (color.0 * fill + rim.0 * ring) / outer,
                (color.1 * fill + rim.1 * ring) / outer,
                (color.2 * fill + rim.2 * ring) / outer,
            );
            blend_pixel(&mut pixels, idx, c, outer);
        }
    }
    pixels
}

/// Clock face — a thin ring with two hands, fitting for a time tracker.
fn draw_clock(color: Rgb, radius: f64) -> Vec<u8> {
    let inner = radius * 0.80; // thin outline ring
    let canvas = ICON_CANVAS;
    let mut pixels = vec![0u8; canvas * canvas * 4];
    let center = canvas as f64 / 2.0;

    // Hands point to ~10:10 (a balanced, recognizable clock pose).
    // Angle measured clockwise from 12 o'clock: dir = (sin a, -cos a).
    let minute_a: f64 = 60.0_f64.to_radians(); // toward 2 o'clock
    let hour_a: f64 = 300.0_f64.to_radians(); // toward 10 o'clock
    let minute_end = (
        center + minute_a.sin() * radius * 0.60,
        center - minute_a.cos() * radius * 0.60,
    );
    let hour_end = (
        center + hour_a.sin() * radius * 0.42,
        center - hour_a.cos() * radius * 0.42,
    );
    let hand_hw = (radius * 0.11).max(1.0); // half-thickness
    let hub_r = radius * 0.13;

    for y in 0..canvas {
        for x in 0..canvas {
            let px = x as f64 + 0.5;
            let py = y as f64 + 0.5;
            let dist = ((px - center).powi(2) + (py - center).powi(2)).sqrt();
            let idx = (y * canvas + x) * 4;

            // Outline ring.
            let ring = (radius + 0.5 - dist)
                .clamp(0.0, 1.0)
                .min((dist - inner + 0.5).clamp(0.0, 1.0));
            // Hands + center hub.
            let dm = dist_to_segment(px, py, center, center, minute_end.0, minute_end.1);
            let dh = dist_to_segment(px, py, center, center, hour_end.0, hour_end.1);
            let hands = (hand_hw + 0.5 - dm.min(dh)).clamp(0.0, 1.0);
            let hub = (hub_r + 0.5 - dist).clamp(0.0, 1.0);

            let cov = ring.max(hands).max(hub);
            blend_pixel(&mut pixels, idx, color, cov);
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
    window
        .set_always_on_top(!detached)
        .map_err(|e| e.to_string())?;

    #[cfg(not(target_os = "linux"))]
    window
        .set_skip_taskbar(!detached)
        .map_err(|e| e.to_string())?;

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

/// Apply the persisted "True Tray" preference at startup (macOS only). When
/// enabled, the activation policy is set to `Accessory` so the app is a true
/// menu-bar app — hidden from the Dock and the Cmd+Tab switcher. When disabled
/// the default `Regular` policy is kept. Applied once at launch, so changes take
/// effect after restarting the app. No-op on other platforms.
#[cfg(target_os = "macos")]
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

/// Position the popup on a specific monitor at the given corner/center.
/// `pos`: 0=bottom-right, 1=bottom-left, 2=top-right, 3=top-left, 4=center
fn position_on_monitor(window: &WebviewWindow, monitor_index: u8, pos: u8) -> tauri::Result<()> {
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

#[cfg(target_os = "macos")]
fn tray_scale_factor(tray: &tauri::tray::TrayIcon<tauri::Wry>) -> Option<f64> {
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

#[cfg(not(target_os = "macos"))]
fn tray_scale_factor(_tray: &tauri::tray::TrayIcon<tauri::Wry>) -> Option<f64> {
    None
}

fn position_popup(
    window: &WebviewWindow,
    tray_rect: &tauri::Rect,
    tray_scale: Option<f64>,
) -> tauri::Result<()> {
    #[cfg(target_os = "macos")]
    {
        // macOS reports the status-item rect in physical pixels of the display
        // containing the icon, while NSWindow positions use screen points. The
        // popup can still be on another display, so its scale factor must not be
        // used to decode the tray rect.
        let tray_scale = tray_scale.unwrap_or_else(|| window.scale_factor().unwrap_or(1.0));
        let window_scale = window.scale_factor().unwrap_or(1.0);
        let tray_pos: tauri::LogicalPosition<f64> = tray_rect.position.to_logical(tray_scale);
        let tray_size: tauri::LogicalSize<f64> = tray_rect.size.to_logical(tray_scale);
        let win_size: tauri::LogicalSize<f64> = window.outer_size()?.to_logical(window_scale);

        let x = tray_pos.x + tray_size.width / 2.0 - win_size.width / 2.0;
        let y = tray_pos.y + tray_size.height;
        let position: PhysicalPosition<i32> =
            tauri::LogicalPosition::new(x, y).to_physical(window_scale);

        return window.set_position(position);
    }

    #[cfg(not(target_os = "macos"))]
    {
        // Tauri tray rectangles and window positions are already physical on
        // Windows and Linux. Do not apply the popup window's scale a second time.
        let tray_pos: PhysicalPosition<i32> = tray_rect.position.to_physical(1.0);
        let tray_size: tauri::PhysicalSize<i32> = tray_rect.size.to_physical(1.0);
        let win_size = window.outer_size()?;

        let x = tray_pos.x + tray_size.width / 2 - win_size.width as i32 / 2;
        let y = tray_pos.y - win_size.height as i32;

        window.set_position(PhysicalPosition::new(x, y))
    }
}

#[cfg(target_os = "macos")]
static VIBRANCY_APPLIED: AtomicBool = AtomicBool::new(false);

fn validate_popup_geometry(width: f64, height: f64, zoom: f64) -> Result<(), String> {
    if !width.is_finite() || !(240.0..=1600.0).contains(&width) {
        return Err("Popup width must be between 240 and 1600".into());
    }
    if !height.is_finite() || !(200.0..=1200.0).contains(&height) {
        return Err("Popup height must be between 200 and 1200".into());
    }
    if !zoom.is_finite() || !(0.5..=2.5).contains(&zoom) {
        return Err("Popup zoom must be between 0.5 and 2.5".into());
    }
    Ok(())
}

#[tauri::command]
pub fn set_popup_vibrancy(app: AppHandle, enabled: bool) -> Result<(), String> {
    let window = app
        .get_webview_window("tray-popup")
        .ok_or("Popup not found")?;

    #[cfg(target_os = "macos")]
    {
        use window_vibrancy::{
            apply_vibrancy, clear_vibrancy, NSVisualEffectMaterial, NSVisualEffectState,
        };
        let applied = VIBRANCY_APPLIED.load(Ordering::SeqCst);
        if enabled && !applied {
            apply_vibrancy(
                &window,
                NSVisualEffectMaterial::Popover,
                Some(NSVisualEffectState::Active),
                None,
            )
            .map_err(|e| format!("{e}"))?;
            VIBRANCY_APPLIED.store(true, Ordering::SeqCst);
        } else if !enabled && applied {
            clear_vibrancy(&window).map_err(|e| format!("{e}"))?;
            VIBRANCY_APPLIED.store(false, Ordering::SeqCst);
        }
    }

    #[cfg(not(target_os = "macos"))]
    let _ = (window, enabled);

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::{parse_hex_color, tray_label_title, validate_popup_geometry, validate_text};

    #[test]
    fn tray_label_title_supports_every_configured_style() {
        assert_eq!(
            tray_label_title("timer", "Project", "Activity", 3_661, true),
            "01:01:01"
        );
        assert_eq!(
            tray_label_title("timer", "Project", "Activity", 3_661, false),
            "01:01"
        );
        assert_eq!(
            tray_label_title("project", "Project", "Activity", 3_661, true),
            "Project"
        );
        assert_eq!(
            tray_label_title("activity", "Project", "Activity", 3_661, true),
            "Activity"
        );
        assert_eq!(
            tray_label_title("hidden", "Project", "Activity", 3_661, true),
            ""
        );
    }

    #[test]
    fn popup_geometry_accepts_supported_values() {
        assert!(validate_popup_geometry(360.0, 640.0, 1.0).is_ok());
    }

    #[test]
    fn popup_geometry_rejects_non_finite_and_extreme_values() {
        assert!(validate_popup_geometry(f64::NAN, 640.0, 1.0).is_err());
        assert!(validate_popup_geometry(360.0, f64::INFINITY, 1.0).is_err());
        assert!(validate_popup_geometry(360.0, 640.0, 10.0).is_err());
    }

    #[test]
    fn native_text_and_color_inputs_are_bounded() {
        assert!(validate_text("Kimai", 5, "label").is_ok());
        assert!(validate_text("KimaiTray", 5, "label").is_err());
        assert_eq!(parse_hex_color("#10b981"), Some(0x10_b9_81));
        assert_eq!(parse_hex_color("not-a-color"), None);
    }
}

#[tauri::command]
pub fn set_popup_size(app: AppHandle, width: f64, height: f64, zoom: f64) -> Result<(), String> {
    validate_popup_geometry(width, height, zoom)?;
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
    if !radius.is_finite() || !(0.0..=64.0).contains(&radius) {
        return Err("Corner radius must be between 0 and 64".into());
    }
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

    TRAY_LEFT_ACTION.store(left, Ordering::SeqCst);
    TRAY_RIGHT_ACTION.store(right, Ordering::SeqCst);

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
                if POPUP_MONITOR_MODE.load(Ordering::SeqCst) == 1 {
                    let idx = POPUP_MONITOR_INDEX.load(Ordering::SeqCst);
                    let pos = POPUP_MONITOR_POS.load(Ordering::SeqCst);
                    let _ = position_on_monitor(&popup, idx, pos);
                } else if let Some(tray) = app.tray_by_id("main") {
                    if let Ok(Some(rect)) = tray.rect() {
                        let _ = position_popup(&popup, &rect, tray_scale_factor(&tray));
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
            let left = s
                .get("trayLeftClickAction")
                .and_then(|v| v.as_str())
                .unwrap_or("popup");
            let right = s
                .get("trayRightClickAction")
                .and_then(|v| v.as_str())
                .unwrap_or("menu");
            let display = s
                .get("displayMode")
                .and_then(|v| v.as_str())
                .unwrap_or("tray");
            let mon_mode = s
                .get("popupMonitorMode")
                .and_then(|v| v.as_str())
                .unwrap_or("active");
            let mon_index = s
                .get("popupMonitorIndex")
                .and_then(|v| v.as_u64())
                .unwrap_or(0) as u8;
            let mon_pos = s
                .get("popupMonitorPosition")
                .and_then(|v| v.as_str())
                .unwrap_or("bottom-right");
            TRAY_LEFT_ACTION.store(if left == "nothing" { 1 } else { 0 }, Ordering::SeqCst);
            TRAY_RIGHT_ACTION.store(if right == "popup" { 1 } else { 0 }, Ordering::SeqCst);
            DISPLAY_MODE.store(if display == "detached" { 1 } else { 0 }, Ordering::SeqCst);
            POPUP_MONITOR_MODE.store(if mon_mode == "specific" { 1 } else { 0 }, Ordering::SeqCst);
            POPUP_MONITOR_INDEX.store(mon_index, Ordering::SeqCst);
            POPUP_MONITOR_POS.store(
                match mon_pos {
                    "bottom-left" => 1,
                    "top-right" => 2,
                    "top-left" => 3,
                    "center" => 4,
                    _ => 0,
                },
                Ordering::SeqCst,
            );
            let icon_size = s
                .get("trayIconSize")
                .and_then(|v| v.as_str())
                .unwrap_or("medium");
            TRAY_ICON_SIZE.store(size_code(icon_size), Ordering::SeqCst);
            let icon_shape = s
                .get("trayIconShape")
                .and_then(|v| v.as_str())
                .unwrap_or("dot");
            TRAY_ICON_SHAPE.store(shape_code(icon_shape), Ordering::SeqCst);
            if let Some(colors) = s.get("trayColors").and_then(|v| v.as_object()) {
                for (idx, key) in ["idle", "running", "paused", "error"].iter().enumerate() {
                    if let Some(packed) = colors
                        .get(*key)
                        .and_then(|v| v.as_str())
                        .and_then(parse_hex_color)
                    {
                        TRAY_COLORS[idx].store(packed, Ordering::SeqCst);
                    }
                }
            }
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

    // Start with idle icon at the persisted size and shape
    let idle_icon = Image::new_owned(
        generate_state_icon(
            0,
            TRAY_ICON_SIZE.load(Ordering::SeqCst),
            TRAY_ICON_SHAPE.load(Ordering::SeqCst),
        ),
        ICON_CANVAS as u32,
        ICON_CANVAS as u32,
    );

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
                                if let Ok(parsed) = tauri::Url::parse(url) {
                                    let allowed = matches!(parsed.scheme(), "http" | "https")
                                        && parsed.username().is_empty()
                                        && parsed.password().is_none();
                                    if allowed {
                                        let _ =
                                            handle.opener().open_url(parsed.as_str(), None::<&str>);
                                    }
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
                        if now_ms().saturating_sub(LAST_POPUP_HIDE.load(Ordering::SeqCst)) < 300 {
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
                                if now_ms().saturating_sub(LAST_POPUP_HIDE.load(Ordering::SeqCst))
                                    < 300
                                {
                                    return;
                                }
                                if is_detached() {
                                    let _ = popup.show();
                                    let _ = popup.set_focus();
                                } else {
                                    let _ = position_popup(&popup, &rect, tray_scale_factor(tray));
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
    // Runs natively so macOS/Linux cannot throttle it like webview JS timers.
    // Also emits kimai://tick to the popup so the JS elapsed counter stays alive
    // on Linux where WebKitGTK throttles setInterval for unfocused windows.
    let ticker_app = app.clone();
    std::thread::spawn(move || loop {
        std::thread::sleep(Duration::from_secs(1));
        tick_tray(&ticker_app);
        if let Some(popup) = ticker_app.get_webview_window("tray-popup") {
            let _ = popup.emit("kimai://tick", ());
        }
    });

    Ok(())
}
