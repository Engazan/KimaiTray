use std::collections::HashMap;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::OnceLock;

use glib::variant::{ObjectPath, ToVariant};
use glib::{Variant, VariantDict};
use gtk::gio::{self, BusType, DBusCallFlags, DBusConnection, DBusSignalFlags};

const PORTAL: &str = "org.freedesktop.portal.Desktop";
const PORTAL_PATH: &str = "/org/freedesktop/portal/desktop";
const INHIBIT: &str = "org.freedesktop.portal.Inhibit";
const GNOME_SESSION: &str = "org.gnome.SessionManager";
const LOGIND: &str = "org.freedesktop.login1";
const REQUEST_TOKEN: &str = "kimaitray_shutdown_request";
const SESSION_TOKEN: &str = "kimaitray_shutdown_session";
const QUERY_END: u32 = 2;
const ENDING: u32 = 3;

// Keep the shared bus connections and their signal subscriptions alive for
// the lifetime of the tray. A desktop shutdown can arrive on both buses.
static SESSION_BUS: OnceLock<DBusConnection> = OnceLock::new();
static SYSTEM_BUS: OnceLock<DBusConnection> = OnceLock::new();
static HANDLED: AtomicBool = AtomicBool::new(false);

fn stop_once() {
    if !HANDLED.swap(true, Ordering::Relaxed) {
        super::on_session_end();
    }
}

fn portal_session_state(parameters: &Variant, session_path: &str) -> Option<(ObjectPath, u32)> {
    let (session, state) = parameters.get::<(ObjectPath, HashMap<String, Variant>)>()?;
    if session.as_str() != session_path {
        return None;
    }
    Some((session, state.get("session-state")?.get()?))
}

pub(super) fn register() {
    glib::MainContext::default().spawn_local(async {
        let Ok(bus) = gio::bus_get_future(BusType::Session).await else {
            log::debug!("Session bus unavailable for shutdown monitoring");
            return;
        };
        bus.signal_subscribe(
            Some(GNOME_SESSION),
            Some(GNOME_SESSION),
            Some("SessionOver"),
            Some("/org/gnome/SessionManager"),
            None,
            DBusSignalFlags::NONE,
            |_, _, _, _, _, _| stop_once(),
        );
        if let Err(error) = register_portal_monitor(&bus).await {
            log::debug!("Desktop portal session monitoring unavailable: {error}");
        }
        let _ = SESSION_BUS.set(bus);
    });

    glib::MainContext::default().spawn_local(async {
        let Ok(bus) = gio::bus_get_future(BusType::System).await else {
            log::debug!("System bus unavailable for shutdown monitoring");
            return;
        };
        bus.signal_subscribe(
            Some(LOGIND),
            Some("org.freedesktop.login1.Manager"),
            Some("PrepareForShutdown"),
            Some("/org/freedesktop/login1"),
            None,
            DBusSignalFlags::NONE,
            |_, _, _, _, _, parameters| match parameters.get::<(bool,)>() {
                Some((true,)) => stop_once(),
                Some((false,)) => HANDLED.store(false, Ordering::Relaxed),
                None => {}
            },
        );
        let _ = SYSTEM_BUS.set(bus);
    });
}

async fn register_portal_monitor(bus: &DBusConnection) -> Result<(), String> {
    let version = bus
        .call_future(
            Some(PORTAL),
            PORTAL_PATH,
            "org.freedesktop.DBus.Properties",
            "Get",
            Some(&(INHIBIT, "version").to_variant()),
            None,
            DBusCallFlags::NONE,
            3000,
        )
        .await
        .map_err(|error| error.to_string())?;
    if !matches!(version.get::<(Variant,)>(), Some((value,)) if value.get::<u32>().is_some_and(|v| v >= 3))
    {
        return Err("the Inhibit portal does not support session-end events".into());
    }

    // The portal derives both object paths from the sender and the tokens.
    // Subscribe before creating the monitor so early signals aren't missed.
    let unique_name = bus.unique_name().ok_or("missing session bus name")?;
    let sender = unique_name.trim_start_matches(':').replace('.', "_");
    let request_path = format!("{PORTAL_PATH}/request/{sender}/{REQUEST_TOKEN}");
    let session_path = format!("{PORTAL_PATH}/session/{sender}/{SESSION_TOKEN}");
    let state_subscription = bus.signal_subscribe(
        Some(PORTAL),
        Some(INHIBIT),
        Some("StateChanged"),
        Some(PORTAL_PATH),
        None,
        DBusSignalFlags::NONE,
        move |bus, _, _, _, _, parameters| {
            match portal_session_state(parameters, &session_path) {
                // Acknowledge the query promptly. It can still be cancelled.
                Some((session, QUERY_END)) => bus.call(
                    Some(PORTAL),
                    PORTAL_PATH,
                    INHIBIT,
                    "QueryEndResponse",
                    Some(&(session,).to_variant()),
                    None,
                    DBusCallFlags::NONE,
                    1000,
                    gio::Cancellable::NONE,
                    |_| {},
                ),
                Some((_, ENDING)) => stop_once(),
                _ => {}
            }
        },
    );
    let response_subscription = bus.signal_subscribe(
        Some(PORTAL),
        Some("org.freedesktop.portal.Request"),
        Some("Response"),
        Some(&request_path),
        None,
        DBusSignalFlags::NONE,
        |_, _, _, _, _, parameters| {
            if let Some((status, _)) = parameters.get::<(u32, HashMap<String, Variant>)>() {
                if status != 0 {
                    log::debug!("Desktop portal declined shutdown monitoring ({status})");
                }
            }
        },
    );
    let options = VariantDict::new(None);
    options.insert("handle_token", REQUEST_TOKEN);
    options.insert("session_handle_token", SESSION_TOKEN);
    let arguments = Variant::tuple_from_iter(["".to_variant(), options.end()]);
    if let Err(error) = bus
        .call_future(
            Some(PORTAL),
            PORTAL_PATH,
            INHIBIT,
            "CreateMonitor",
            Some(&arguments),
            None,
            DBusCallFlags::NONE,
            3000,
        )
        .await
    {
        bus.signal_unsubscribe(state_subscription);
        bus.signal_unsubscribe(response_subscription);
        return Err(error.to_string());
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn portal_ignores_other_monitors_and_screensaver_notifications() {
        let session = ObjectPath::try_from("/portal/session/our_monitor").unwrap();
        let screensaver = HashMap::from([("screensaver-active", true.to_variant())]);
        let signal = (session.clone(), screensaver).to_variant();
        assert_eq!(portal_session_state(&signal, session.as_str()), None);

        for state in [1, QUERY_END, ENDING] {
            let changes = HashMap::from([("session-state", state.to_variant())]);
            let signal = (session.clone(), changes).to_variant();
            assert_eq!(
                portal_session_state(&signal, session.as_str()),
                Some((session.clone(), state))
            );
            assert_eq!(portal_session_state(&signal, "/portal/session/other"), None);
        }
    }
}
