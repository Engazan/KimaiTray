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

    pub fn idle_seconds() -> Result<u64, String> {
        // Try xprintidle first (works on X11, available on most distros)
        if let Ok(mut child) = Command::new("xprintidle")
            .stdout(Stdio::piped())
            .stderr(Stdio::null())
            .spawn()
        {
            let deadline = Instant::now() + Duration::from_secs(2);
            loop {
                match child.try_wait() {
                    Ok(Some(status)) => {
                        let mut stdout = String::new();
                        if let Some(mut pipe) = child.stdout.take() {
                            let _ = pipe.read_to_string(&mut stdout);
                        }
                        if status.success() {
                            if let Ok(ms) = stdout.trim().parse::<u64>() {
                                return Ok(ms / 1000);
                            }
                        }
                        break;
                    }
                    Ok(None) if Instant::now() < deadline => {
                        std::thread::sleep(Duration::from_millis(25));
                    }
                    Ok(None) => {
                        let _ = child.kill();
                        let _ = child.wait();
                        return Err("xprintidle timed out".into());
                    }
                    Err(_) => break,
                }
            }
        }
        Err(
            "Idle detection unavailable — install xprintidle (X11) or use a supported environment"
                .into(),
        )
    }
}

#[cfg(not(any(target_os = "macos", target_os = "windows", target_os = "linux")))]
mod platform {
    pub fn idle_seconds() -> Result<u64, String> {
        Err("Idle detection not supported on this platform".into())
    }
}
