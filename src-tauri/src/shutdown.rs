use std::sync::{mpsc, OnceLock};
use std::time::{Duration, Instant};

use serde_json::Value;
use tauri::AppHandle;
use tauri_plugin_store::StoreExt;

use crate::{http::stop_running_kimai_timers, keychain::get_api_token};

#[cfg(target_os = "linux")]
mod linux;

const STOP_BUDGET: Duration = Duration::from_millis(1500);
static APP_HANDLE: OnceLock<AppHandle> = OnceLock::new();

pub fn register(app: &AppHandle) -> Result<(), String> {
    if APP_HANDLE.set(app.clone()).is_ok() {
        #[cfg(any(target_os = "macos", target_os = "windows"))]
        platform::register()?;
        #[cfg(target_os = "linux")]
        linux::register();
    }
    Ok(())
}

fn shutdown_connection(settings: &Value) -> Option<(&str, &str)> {
    if settings.get("stopTimerOnShutdown")?.as_bool() != Some(true) {
        return None;
    }
    let id = settings.get("activeConnectionId")?.as_str()?;
    if id.is_empty() {
        return None;
    }
    let connection = settings
        .get("connections")?
        .as_array()?
        .iter()
        .find(|connection| connection.get("id").and_then(Value::as_str) == Some(id))?;
    let url = connection
        .get("url")?
        .as_str()?
        .trim()
        .trim_end_matches('/');
    (!url.is_empty()).then_some((id, url))
}

async fn stop_timers(app: AppHandle) -> Result<(), String> {
    let Some(settings) = app
        .get_store("settings.json")
        .and_then(|store| store.get("settings"))
    else {
        return Ok(());
    };
    let Some((id, url)) = shutdown_connection(&settings) else {
        return Ok(());
    };

    // Use the saved connection's token. Older installations may still have a
    // token stored under the server URL until the UI migrates it.
    let token = match get_api_token(app.clone(), format!("conn-token:{id}")).await? {
        Some(token) => Some(token),
        None => get_api_token(app, url.to_string()).await?,
    };
    if let Some(token) = token {
        stop_running_kimai_timers(url, &token).await?;
    }
    Ok(())
}

fn on_session_end() {
    let Some(app) = APP_HANDLE.get().cloned() else {
        return;
    };
    let deadline = Instant::now() + STOP_BUDGET;
    let (finished, result) = mpsc::sync_channel(1);
    let task = tauri::async_runtime::spawn(async move {
        let outcome = tokio::time::timeout_at(deadline.into(), stop_timers(app)).await;
        let _ = finished.send(outcome);
    });

    // The OS can terminate us once the native callback returns. Keep the
    // callback alive only within this budget, while all work runs off-thread.
    match result.recv_timeout(deadline.saturating_duration_since(Instant::now())) {
        Ok(Ok(Ok(()))) => {}
        Ok(Ok(Err(error))) => log::warn!("Could not stop running timers at session end: {error}"),
        Ok(Err(_)) | Err(_) => {
            task.abort();
            log::warn!("Session ended before the timer stop attempt completed");
        }
    }
}

#[cfg(test)]
mod tests {
    use serde_json::json;

    use super::shutdown_connection;

    #[test]
    fn selects_only_the_active_connection_when_explicitly_enabled() {
        let mut settings = json!({
            "activeConnectionId": "work",
            "connections": [
                { "id": "personal", "url": "https://personal.example" },
                { "id": "work", "url": "https://work.example/kimai/" }
            ]
        });
        assert_eq!(shutdown_connection(&settings), None);
        settings["stopTimerOnShutdown"] = json!("true");
        assert_eq!(shutdown_connection(&settings), None);
        settings["stopTimerOnShutdown"] = json!(true);
        assert_eq!(
            shutdown_connection(&settings),
            Some(("work", "https://work.example/kimai"))
        );
        settings["activeConnectionId"] = json!("missing");
        assert_eq!(shutdown_connection(&settings), None);
    }
}

#[cfg(target_os = "macos")]
mod platform {
    use objc::declare::ClassDecl;
    use objc::runtime::{Object, Sel};
    use objc::{class, msg_send, sel, sel_impl};

    extern "C" fn will_power_off(_observer: &Object, _selector: Sel, _notification: *mut Object) {
        super::on_session_end();
    }

    pub(super) fn register() -> Result<(), String> {
        let mut declaration = ClassDecl::new("KimaiTrayShutdownObserver", class!(NSObject))
            .ok_or("Failed to create the macOS shutdown observer")?;
        unsafe {
            declaration.add_method(
                sel!(workspaceWillPowerOff:),
                will_power_off as extern "C" fn(&Object, Sel, *mut Object),
            );
            let observer_class = declaration.register();
            let workspace: *mut Object = msg_send![class!(NSWorkspace), sharedWorkspace];
            let center: *mut Object = msg_send![workspace, notificationCenter];
            let notification: *mut Object = msg_send![
                class!(NSString),
                stringWithUTF8String: c"NSWorkspaceWillPowerOffNotification".as_ptr()
            ];
            if center.is_null() || notification.is_null() {
                return Err("Failed to access macOS workspace notifications".into());
            }
            let observer: *mut Object = msg_send![observer_class, new];
            if observer.is_null() {
                return Err("Failed to allocate the macOS shutdown observer".into());
            }
            // Keep the observer alive for the lifetime of the application.
            let _: () = msg_send![
                center,
                addObserver: observer
                selector: sel!(workspaceWillPowerOff:)
                name: notification
                object: workspace
            ];
        }
        Ok(())
    }
}

#[cfg(target_os = "windows")]
mod platform {
    use std::ptr::null_mut;
    use std::sync::atomic::{AtomicBool, Ordering};

    use windows_sys::Win32::{
        Foundation::{LPARAM, LRESULT, WPARAM},
        System::Threading::GetCurrentThreadId,
        UI::WindowsAndMessaging::{
            CallNextHookEx, SetWindowsHookExW, CWPSTRUCT, ENDSESSION_CLOSEAPP, HC_ACTION,
            WH_CALLWNDPROC, WM_ENDSESSION,
        },
    };

    static HANDLED: AtomicBool = AtomicBool::new(false);

    unsafe extern "system" fn on_window_message(
        code: i32,
        wparam: WPARAM,
        lparam: LPARAM,
    ) -> LRESULT {
        if code == HC_ACTION as i32 {
            let message = unsafe { &*(lparam as *const CWPSTRUCT) };
            if message.message == WM_ENDSESSION
                && message.wParam != 0
                && (message.lParam as u32 & ENDSESSION_CLOSEAPP) == 0
                && !HANDLED.swap(true, Ordering::Relaxed)
            {
                super::on_session_end();
            }
        }
        unsafe { CallNextHookEx(null_mut(), code, wparam, lparam) }
    }

    pub(super) fn register() -> Result<(), String> {
        // Tao can exit directly from its internal window's WM_ENDSESSION
        // handler. Observe sent messages before dispatch on its GUI thread.
        let hook = unsafe {
            SetWindowsHookExW(
                WH_CALLWNDPROC,
                Some(on_window_message),
                null_mut(),
                GetCurrentThreadId(),
            )
        };
        if hook.is_null() {
            return Err(std::io::Error::last_os_error().to_string());
        }
        Ok(())
    }
}
