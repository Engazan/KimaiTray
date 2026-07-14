use serde::Serialize;

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PlatformInfo {
    os: &'static str,
    session: &'static str,
    tray_backend: &'static str,
    supports_tray_click_actions: bool,
    supports_native_popup_corners: bool,
    supports_global_shortcuts: bool,
    supports_window_positioning: bool,
    supports_always_on_top: bool,
}

#[cfg(target_os = "linux")]
fn linux_session() -> &'static str {
    if let Ok(session) = std::env::var("XDG_SESSION_TYPE") {
        if session.eq_ignore_ascii_case("wayland") {
            return "wayland";
        }
        if session.eq_ignore_ascii_case("x11") {
            return "x11";
        }
    }
    if std::env::var("WAYLAND_DISPLAY").is_ok_and(|value| !value.is_empty()) {
        return "wayland";
    }
    if std::env::var("DISPLAY").is_ok_and(|value| !value.is_empty()) {
        return "x11";
    }
    "unknown"
}

pub fn is_wayland() -> bool {
    #[cfg(target_os = "linux")]
    {
        linux_session() == "wayland"
    }
    #[cfg(not(target_os = "linux"))]
    {
        false
    }
}

pub fn supports_global_shortcuts() -> bool {
    !is_wayland()
}

pub fn supports_window_positioning() -> bool {
    !is_wayland()
}

pub fn supports_always_on_top() -> bool {
    !is_wayland()
}

#[tauri::command]
pub fn get_platform_info() -> PlatformInfo {
    #[cfg(target_os = "linux")]
    {
        let tray_backend = crate::tray::platform_tray_backend();
        PlatformInfo {
            os: "linux",
            session: linux_session(),
            tray_backend,
            supports_tray_click_actions: tray_backend == "legacy-gtk",
            supports_native_popup_corners: false,
            supports_global_shortcuts: supports_global_shortcuts(),
            supports_window_positioning: supports_window_positioning(),
            supports_always_on_top: supports_always_on_top(),
        }
    }

    #[cfg(target_os = "macos")]
    {
        PlatformInfo {
            os: "macos",
            session: "native",
            tray_backend: "native",
            supports_tray_click_actions: true,
            supports_native_popup_corners: true,
            supports_global_shortcuts: true,
            supports_window_positioning: true,
            supports_always_on_top: true,
        }
    }

    #[cfg(target_os = "windows")]
    {
        PlatformInfo {
            os: "windows",
            session: "native",
            tray_backend: "native",
            supports_tray_click_actions: true,
            supports_native_popup_corners: false,
            supports_global_shortcuts: true,
            supports_window_positioning: true,
            supports_always_on_top: true,
        }
    }

    #[cfg(not(any(target_os = "linux", target_os = "macos", target_os = "windows")))]
    {
        PlatformInfo {
            os: "unknown",
            session: "unknown",
            tray_backend: "native",
            supports_tray_click_actions: false,
            supports_native_popup_corners: false,
            supports_global_shortcuts: false,
            supports_window_positioning: false,
            supports_always_on_top: false,
        }
    }
}
