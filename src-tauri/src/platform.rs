use serde::Serialize;

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PlatformInfo {
    os: &'static str,
    session: &'static str,
    tray_backend: &'static str,
    supports_tray_click_actions: bool,
    supports_native_popup_corners: bool,
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
        }
    }
}
