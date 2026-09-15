#[cfg(target_os = "linux")]
use super::platform::linux::{legacy_set_tooltip, linux_uses_appindicator};
use super::validate_text;
use std::sync::Mutex;
use std::time::{Duration, SystemTime, UNIX_EPOCH};
use tauri::{AppHandle, Emitter, Manager};

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

#[cfg_attr(target_os = "linux", allow(dead_code))]
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

        let elapsed = format_elapsed(secs, true);
        let tooltip = format!("{project} — {activity} — {elapsed}");
        #[cfg(target_os = "linux")]
        {
            let _ = (&label_style, show_seconds);
            if linux_uses_appindicator() {
                if let Some(tray) = app.tray_by_id("main") {
                    let _ = tray.set_tooltip(Some(&tooltip));
                }
            } else {
                let _ = legacy_set_tooltip(app, tooltip);
            }
        }

        #[cfg(not(target_os = "linux"))]
        if let Some(tray) = app.tray_by_id("main") {
            let _ = tray.set_tooltip(Some(&tooltip));
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

    #[cfg(target_os = "linux")]
    if linux_uses_appindicator() {
        if let Some(tray) = app.tray_by_id("main") {
            let _ = tray.set_tooltip(Some("KimaiTray"));
        }
    } else {
        let _ = legacy_set_tooltip(&app, "KimaiTray".into());
    }
    #[cfg(not(target_os = "linux"))]
    if let Some(tray) = app.tray_by_id("main") {
        let _ = tray.set_title(Some(""));
        let _ = tray.set_tooltip(Some("KimaiTray"));
    }
    Ok(())
}

#[tauri::command]
pub fn set_tray_tooltip(app: AppHandle, text: String) -> Result<(), String> {
    validate_text(&text, 768, "Tray tooltip")?;
    #[cfg(target_os = "linux")]
    {
        if linux_uses_appindicator() {
            let tray = app.tray_by_id("main").ok_or("Tray icon not found")?;
            tray.set_tooltip(Some(&text)).map_err(|e| e.to_string())
        } else {
            legacy_set_tooltip(&app, text)
        }
    }
    #[cfg(not(target_os = "linux"))]
    {
        let tray = app.tray_by_id("main").ok_or("Tray icon not found")?;
        tray.set_tooltip(Some(&text)).map_err(|e| e.to_string())
    }
}

#[tauri::command]
pub fn set_tray_title(app: AppHandle, title: String) -> Result<(), String> {
    validate_text(&title, 256, "Tray title")?;
    #[cfg(target_os = "linux")]
    {
        let _ = app;
        Ok(()) // GtkStatusIcon has no adjacent text label.
    }
    #[cfg(not(target_os = "linux"))]
    {
        let tray = app.tray_by_id("main").ok_or("Tray icon not found")?;
        // Always pass Some — tray-icon's macOS impl ignores None instead of clearing
        tray.set_title(Some(&title)).map_err(|e| e.to_string())
    }
}

pub(super) fn start_background_ticker(app: &AppHandle) {
    let ticker_app = app.clone();
    std::thread::spawn(move || loop {
        std::thread::sleep(Duration::from_secs(1));
        tick_tray(&ticker_app);
        if let Some(popup) = ticker_app.get_webview_window("tray-popup") {
            let _ = popup.emit("kimai://tick", ());
        }
    });
}

#[cfg(test)]
mod tests {
    use super::*;

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
}
