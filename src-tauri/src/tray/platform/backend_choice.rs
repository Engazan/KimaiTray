pub(super) fn linux_needs_appindicator(
    backend: Option<&str>,
    desktop: &str,
    is_wayland: bool,
) -> bool {
    if let Some(backend) = backend {
        return backend.eq_ignore_ascii_case("appindicator");
    }
    // GtkStatusIcon uses XEmbed and cannot create a native Wayland tray icon.
    is_wayland || desktop_name_needs_appindicator(&desktop.to_ascii_lowercase())
}
fn desktop_name_needs_appindicator(desktop: &str) -> bool {
    ["gnome", "ubuntu", "unity", "pantheon", "budgie", "sway"]
        .iter()
        .any(|name| desktop.contains(name))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn selects_tray_backend_for_common_linux_desktops() {
        for desktop in [
            "ubuntu:GNOME",
            "gnome",
            "GNOME",
            "budgie:gnome",
            "Unity",
            "Pantheon",
            "sway",
        ] {
            assert!(linux_needs_appindicator(None, desktop, false), "{desktop}");
        }
        for desktop in ["X-Cinnamon", "XFCE", "MATE"] {
            assert!(!linux_needs_appindicator(None, desktop, false), "{desktop}");
        }
    }
    #[test]
    fn wayland_uses_appindicator_without_changing_legacy_x11_desktops() {
        for desktop in [
            "KDE",
            "kde",
            "Plasma",
            "plasmawayland",
            "KDE:Plasma",
            "X-Cinnamon",
            "XFCE",
            "MATE",
            "unknown",
            "",
        ] {
            assert!(linux_needs_appindicator(None, desktop, true), "{desktop}");
            assert!(!linux_needs_appindicator(None, desktop, false), "{desktop}");
        }
    }
    #[test]
    fn explicit_tray_backend_overrides_desktop_and_session_detection() {
        assert!(linux_needs_appindicator(
            Some("AppIndicator"),
            "XFCE",
            false
        ));
        assert!(!linux_needs_appindicator(Some("legacy-gtk"), "KDE", true));
    }
}
