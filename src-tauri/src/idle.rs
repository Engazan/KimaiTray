#[tauri::command]
pub fn get_idle_seconds() -> Result<u64, String> {
    platform::idle_seconds()
}

#[cfg(target_os = "macos")]
mod platform {
    use std::os::raw::c_double;

    #[link(name = "CoreGraphics", kind = "framework")]
    extern "C" {
        fn CGEventSourceSecondsSinceLastEventType(source_state: u32, event_type: u32) -> c_double;
    }

    pub fn idle_seconds() -> Result<u64, String> {
        // kCGEventSourceStateCombinedSessionState = 0, kCGAnyInputEventType = 0xFFFFFFFF
        let secs = unsafe { CGEventSourceSecondsSinceLastEventType(0, 0xFFFFFFFF) };
        if secs >= 0.0 {
            Ok(secs as u64)
        } else {
            Err("Failed to query idle time".into())
        }
    }
}

#[cfg(target_os = "windows")]
mod platform {
    use windows_sys::Win32::System::SystemInformation::GetTickCount;
    use windows_sys::Win32::UI::Input::KeyboardAndMouse::{GetLastInputInfo, LASTINPUTINFO};

    pub fn idle_seconds() -> Result<u64, String> {
        let mut info = LASTINPUTINFO {
            cbSize: std::mem::size_of::<LASTINPUTINFO>() as u32,
            dwTime: 0,
        };
        let ok = unsafe { GetLastInputInfo(&mut info) };
        if ok == 0 {
            return Err("GetLastInputInfo failed".into());
        }
        let tick = unsafe { GetTickCount() };
        let idle_ms = tick.wrapping_sub(info.dwTime);
        Ok((idle_ms / 1000) as u64)
    }
}

#[cfg(target_os = "linux")]
mod platform {
    use std::io::Read;
    use std::process::{Command, Stdio};
    use std::time::{Duration, Instant};

    fn command_output(program: &str, args: &[&str]) -> Result<String, String> {
        let mut child = Command::new(program)
            .args(args)
            .stdout(Stdio::piped())
            .stderr(Stdio::null())
            .spawn()
            .map_err(|_| format!("{program} is unavailable"))?;
        let deadline = Instant::now() + Duration::from_secs(2);
        loop {
            match child.try_wait() {
                Ok(Some(status)) => {
                    let mut stdout = String::new();
                    if let Some(mut pipe) = child.stdout.take() {
                        let _ = pipe.read_to_string(&mut stdout);
                    }
                    return if status.success() {
                        Ok(stdout)
                    } else {
                        Err(format!("{program} failed"))
                    };
                }
                Ok(None) if Instant::now() < deadline => {
                    std::thread::sleep(Duration::from_millis(25));
                }
                Ok(None) => {
                    let _ = child.kill();
                    let _ = child.wait();
                    return Err(format!("{program} timed out"));
                }
                Err(_) => {
                    let _ = child.kill();
                    let _ = child.wait();
                    return Err(format!("{program} status failed"));
                }
            }
        }
    }

    fn parse_milliseconds(output: &str) -> Option<u64> {
        output
            .split(|character: char| !character.is_ascii_digit())
            .rfind(|part| !part.is_empty())?
            .parse::<u64>()
            .ok()
            .map(|milliseconds| milliseconds / 1000)
    }

    fn x11_idle_seconds() -> Option<u64> {
        command_output("xprintidle", &[])
            .ok()
            .and_then(|output| parse_milliseconds(output.trim()))
    }

    fn gnome_wayland_idle_seconds() -> Option<u64> {
        command_output(
            "gdbus",
            &[
                "call",
                "--session",
                "--dest",
                "org.gnome.Mutter.IdleMonitor",
                "--object-path",
                "/org/gnome/Mutter/IdleMonitor/Core",
                "--method",
                "org.gnome.Mutter.IdleMonitor.GetIdletime",
            ],
        )
        .ok()
        .and_then(|output| parse_milliseconds(&output))
    }

    fn kde_wayland_idle_seconds() -> Option<u64> {
        for program in ["qdbus6", "qdbus"] {
            if let Some(seconds) = command_output(
                program,
                &[
                    "org.kde.KWin",
                    "/org/kde/KIdleTime",
                    "org.kde.KIdleTime.idleTime",
                ],
            )
            .ok()
            .and_then(|output| parse_milliseconds(&output))
            {
                return Some(seconds);
            }
        }
        None
    }

    pub fn idle_seconds() -> Result<u64, String> {
        // X11 first, then desktop-specific D-Bus APIs used on Wayland.
        if let Some(seconds) = x11_idle_seconds() {
            return Ok(seconds);
        }
        if let Some(seconds) = gnome_wayland_idle_seconds() {
            return Ok(seconds);
        }
        if let Some(seconds) = kde_wayland_idle_seconds() {
            return Ok(seconds);
        }
        Err(
            "Idle detection unavailable — install xprintidle or a supported GNOME/KDE D-Bus client"
                .into(),
        )
    }

    #[cfg(test)]
    mod tests {
        use super::parse_milliseconds;

        #[test]
        fn parses_x11_and_dbus_idle_milliseconds() {
            assert_eq!(parse_milliseconds("12500\n"), Some(12));
            assert_eq!(parse_milliseconds("(uint64 90500,)"), Some(90));
            assert_eq!(parse_milliseconds("invalid"), None);
        }
    }
}

#[cfg(not(any(target_os = "macos", target_os = "windows", target_os = "linux")))]
mod platform {
    pub fn idle_seconds() -> Result<u64, String> {
        Err("Idle detection not supported on this platform".into())
    }
}
