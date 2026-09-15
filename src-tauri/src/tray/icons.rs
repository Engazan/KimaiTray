#[cfg(target_os = "linux")]
use super::platform::linux::{legacy_set_icon, linux_uses_appindicator};
use super::TRAY_CONFIGURATION;
use std::sync::atomic::{AtomicU32, AtomicU8, Ordering};
use tauri::{image::Image, AppHandle};

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
pub(super) const ICON_CANVAS: usize = 44;

fn state_code(state: &str) -> u8 {
    match state {
        "running" => 1,
        "paused" => 2,
        "error" => 3,
        _ => 0,
    }
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
    let rgba = generate_state_icon_with_color(size, shape, color);
    #[cfg(target_os = "linux")]
    {
        if linux_uses_appindicator() {
            let tray = app.tray_by_id("main").ok_or("Tray icon not found")?;
            let icon = Image::new_owned(rgba, ICON_CANVAS as u32, ICON_CANVAS as u32);
            tray.set_icon(Some(icon)).map_err(|e| e.to_string())
        } else {
            legacy_set_icon(app, rgba)
        }
    }
    #[cfg(not(target_os = "linux"))]
    {
        let tray = app.tray_by_id("main").ok_or("Tray icon not found")?;
        let icon = Image::new_owned(rgba, ICON_CANVAS as u32, ICON_CANVAS as u32);
        tray.set_icon(Some(icon)).map_err(|e| e.to_string())
    }
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

pub(super) fn initialize(settings: &serde_json::Map<String, serde_json::Value>) {
    TRAY_ICON_SIZE.store(
        size_code(
            settings
                .get("trayIconSize")
                .and_then(|v| v.as_str())
                .unwrap_or("medium"),
        ),
        Ordering::SeqCst,
    );
    TRAY_ICON_SHAPE.store(
        shape_code(
            settings
                .get("trayIconShape")
                .and_then(|v| v.as_str())
                .unwrap_or("dot"),
        ),
        Ordering::SeqCst,
    );
    if let Some(colors) = settings.get("trayColors").and_then(|v| v.as_object()) {
        for (idx, key) in ["idle", "running", "paused", "error"].iter().enumerate() {
            if let Some(color) = colors
                .get(*key)
                .and_then(|v| v.as_str())
                .and_then(parse_hex_color)
            {
                TRAY_COLORS[idx].store(color, Ordering::SeqCst);
            }
        }
    }
}

pub(super) fn initial_rgba() -> Vec<u8> {
    generate_state_icon(
        0,
        TRAY_ICON_SIZE.load(Ordering::SeqCst),
        TRAY_ICON_SHAPE.load(Ordering::SeqCst),
    )
}

#[cfg(test)]
mod tests {
    use super::parse_hex_color;
    #[test]
    fn native_color_inputs_are_bounded() {
        assert_eq!(parse_hex_color("#10b981"), Some(0x10_b9_81));
        assert_eq!(parse_hex_color("not-a-color"), None);
    }
}
