use super::super::{
    actions::{open_kimai, refresh_popup, show_settings_window},
    icons::{initial_rgba, ICON_CANVAS},
    menu::{left_click_opens_popup, right_click_opens_popup},
    popup::{position_on_monitor, suppress_reopen, toggle_popup_window},
};
use super::{backend_choice::linux_needs_appindicator, PopupInteraction};
use gdk::prelude::SeatExt;
use glib::translate::*;
use gtk::prelude::*;
use std::{
    cell::RefCell,
    rc::Rc,
    sync::atomic::{AtomicU8, Ordering},
    time::Duration,
};
use tauri::{AppHandle, PhysicalPosition, WebviewWindow};

glib::wrapper! {
    /// Minimal safe owner for GTK3's deprecated StatusIcon. gtk-rs deliberately
    /// omits the deprecated high-level binding, while GTK3 still exports it.
    struct LegacyStatusIcon(Object<gtk_sys::GtkStatusIcon, gtk_sys::GtkStatusIconClass>);

    match fn {
        type_ => || gtk_sys::gtk_status_icon_get_type(),
    }
}

impl LegacyStatusIcon {
    fn new() -> Self {
        unsafe { from_glib_full(gtk_sys::gtk_status_icon_new()) }
    }

    fn set_pixbuf(&self, pixbuf: &gdk_pixbuf::Pixbuf) {
        unsafe {
            gtk_sys::gtk_status_icon_set_from_pixbuf(self.to_glib_none().0, pixbuf.to_glib_none().0)
        }
    }

    fn set_tooltip(&self, text: &str) {
        unsafe {
            gtk_sys::gtk_status_icon_set_tooltip_text(self.to_glib_none().0, text.to_glib_none().0)
        }
    }

    fn set_visible(&self, visible: bool) {
        unsafe { gtk_sys::gtk_status_icon_set_visible(self.to_glib_none().0, visible.into_glib()) }
    }
}
// 0 = legacy GtkStatusIcon, 1 = AppIndicator/Tauri (Linux only)
static LINUX_TRAY_BACKEND: AtomicU8 = AtomicU8::new(0);

struct LegacyTray {
    icon: LegacyStatusIcon,
    menu: gtk::Menu,
}

thread_local! {
    // GTK widgets are main-thread-only; Tauri's Linux event loop is the GTK
    // main loop, so keep the legacy tray object there instead of in Send state.
    static LEGACY_TRAY: RefCell<Option<LegacyTray>> = const { RefCell::new(None) };
}

fn legacy_pixbuf(rgba: Vec<u8>) -> gdk_pixbuf::Pixbuf {
    let bytes = glib::Bytes::from_owned(rgba);
    gdk_pixbuf::Pixbuf::from_bytes(
        &bytes,
        gdk_pixbuf::Colorspace::Rgb,
        true,
        8,
        ICON_CANVAS as i32,
        ICON_CANVAS as i32,
        (ICON_CANVAS * 4) as i32,
    )
}

pub(in crate::tray) fn legacy_set_icon(app: &AppHandle, rgba: Vec<u8>) -> Result<(), String> {
    app.run_on_main_thread(move || {
        LEGACY_TRAY.with(|slot| {
            if let Some(tray) = slot.borrow().as_ref() {
                tray.icon.set_pixbuf(&legacy_pixbuf(rgba));
            }
        });
    })
    .map_err(|e| e.to_string())
}

pub(in crate::tray) fn legacy_set_tooltip(app: &AppHandle, text: String) -> Result<(), String> {
    app.run_on_main_thread(move || {
        LEGACY_TRAY.with(|slot| {
            if let Some(tray) = slot.borrow().as_ref() {
                tray.icon.set_tooltip(&text);
            }
        });
    })
    .map_err(|e| e.to_string())
}

pub(in crate::tray) fn linux_uses_appindicator() -> bool {
    LINUX_TRAY_BACKEND.load(Ordering::SeqCst) == 1
}

pub fn platform_tray_backend() -> &'static str {
    if linux_uses_appindicator() {
        "appindicator"
    } else {
        "legacy-gtk"
    }
}

fn desktop_needs_appindicator() -> bool {
    let backend = std::env::var("KIMAITRAY_TRAY_BACKEND").ok();
    let desktop = std::env::var("XDG_CURRENT_DESKTOP")
        .or_else(|_| std::env::var("XDG_SESSION_DESKTOP"))
        .unwrap_or_default();
    linux_needs_appindicator(backend.as_deref(), &desktop, crate::platform::is_wayland())
}

fn legacy_menu(app: &AppHandle, labels: [&str; 5]) -> gtk::Menu {
    let menu = gtk::Menu::new();
    let add = |menu: &gtk::Menu, label: &str, action: Rc<dyn Fn()>| {
        let item = gtk::MenuItem::with_label(label);
        // Running the action inside MenuItem::activate shows/focuses the
        // WebView while GTK still owns the popup-menu pointer grab. Cinnamon
        // then keeps sending all motion and button events to the closing menu,
        // leaving both popup and settings visible but non-interactive. Defer
        // until the menu activation has unwound and GTK has released its grab.
        let popup_menu = menu.clone();
        item.connect_activate(move |_| {
            popup_menu.popdown();
            let action = action.clone();
            glib::timeout_add_local_once(Duration::from_millis(50), move || {
                // Some Cinnamon/GTK combinations retain the GDK seat grab even
                // after Menu::popdown. Explicitly release it before focusing a
                // WebKit window or that window receives neither hover nor click.
                if let Some(display) = gdk::Display::default() {
                    if let Some(seat) = display.default_seat() {
                        seat.ungrab();
                    }
                }
                action();
            });
        });
        menu.append(&item);
    };

    let handle = app.clone();
    add(
        &menu,
        labels[0],
        Rc::new(move || toggle_popup_window(&handle)),
    );
    menu.append(&gtk::SeparatorMenuItem::new());
    let handle = app.clone();
    add(
        &menu,
        labels[1],
        Rc::new(move || show_settings_window(&handle)),
    );
    let handle = app.clone();
    add(&menu, labels[2], Rc::new(move || open_kimai(&handle)));
    let handle = app.clone();
    add(&menu, labels[3], Rc::new(move || refresh_popup(&handle)));
    menu.append(&gtk::SeparatorMenuItem::new());
    let handle = app.clone();
    add(&menu, labels[4], Rc::new(move || handle.exit(0)));
    menu.show_all();
    menu
}

pub(in crate::tray) fn popup_interaction(window: &tauri::Window) -> Option<PopupInteraction> {
    let native = window.gtk_window().ok()?;
    let pointer_down = native.window().is_some_and(|surface| {
        surface
            .display()
            .default_seat()
            .and_then(|seat| seat.pointer())
            .is_some_and(|pointer| {
                let (_, _, _, modifiers) = surface.device_position(&pointer);
                modifiers.intersects(
                    gdk::ModifierType::BUTTON1_MASK
                        | gdk::ModifierType::BUTTON2_MASK
                        | gdk::ModifierType::BUTTON3_MASK,
                )
            })
    });
    Some(PopupInteraction {
        focused: native.is_active() || native.has_toplevel_focus(),
        pointer_down,
        resizing: false,
    })
}
pub(in crate::tray) fn position_legacy_popup(window: &WebviewWindow) -> tauri::Result<()> {
    if !crate::platform::supports_window_positioning() {
        return Ok(());
    }
    let geometry = LEGACY_TRAY.with(|slot| {
        slot.borrow().as_ref().and_then(|tray| unsafe {
            let mut screen = std::ptr::null_mut();
            let mut rect = std::mem::zeroed();
            let mut orientation = std::mem::zeroed();
            if from_glib(gtk_sys::gtk_status_icon_get_geometry(
                tray.icon.to_glib_none().0,
                &mut screen,
                &mut rect,
                &mut orientation,
            )) {
                Some((rect.x, rect.y, rect.width, rect.height))
            } else {
                None
            }
        })
    });
    let Some((icon_x, icon_y, icon_w, icon_h)) = geometry else {
        return position_on_monitor(window, 0, 0);
    };
    let win = window.outer_size()?;
    let monitors = window.available_monitors()?;
    let monitor = monitors.iter().find(|monitor| {
        let p = monitor.position();
        let s = monitor.size();
        icon_x >= p.x
            && icon_x < p.x + s.width as i32
            && icon_y >= p.y
            && icon_y < p.y + s.height as i32
    });
    let Some(monitor) = monitor.or_else(|| monitors.first()) else {
        return Ok(());
    };
    let mp = monitor.position();
    let ms = monitor.size();
    let min_x = mp.x;
    let max_x = mp.x + ms.width as i32 - win.width as i32;
    let x = (icon_x + icon_w / 2 - win.width as i32 / 2).clamp(min_x, max_x.max(min_x));
    let monitor_mid = mp.y + ms.height as i32 / 2;
    let y = if icon_y < monitor_mid {
        icon_y + icon_h
    } else {
        icon_y - win.height as i32
    };
    window.set_position(PhysicalPosition::new(x, y))
}
fn create_legacy_tray(app: &AppHandle) -> tauri::Result<()> {
    let icon = LegacyStatusIcon::new();
    icon.set_pixbuf(&legacy_pixbuf(initial_rgba()));
    icon.set_tooltip("KimaiTray");
    icon.set_visible(true);

    let handle = app.clone();
    icon.connect_local("activate", false, move |_| {
        if left_click_opens_popup() && !suppress_reopen() {
            toggle_popup_window(&handle);
        }
        None
    });
    let handle = app.clone();
    icon.connect_local("popup-menu", false, move |values| {
        let button = values.get(1).and_then(|v| v.get::<u32>().ok()).unwrap_or(3);
        let time = values.get(2).and_then(|v| v.get::<u32>().ok()).unwrap_or(0);
        if right_click_opens_popup() {
            toggle_popup_window(&handle);
        } else {
            LEGACY_TRAY.with(|slot| {
                if let Some(tray) = slot.borrow().as_ref() {
                    // GTK 3.22+ handles the current GDK seat and releases its
                    // grab correctly with popup_at_pointer. popup_easy uses the
                    // old global-grab API and can leave WebKit windows unable
                    // to receive pointer events on Cinnamon.
                    let _ = (button, time);
                    tray.menu.popup_at_pointer(None::<&gdk::Event>);
                }
            });
        }
        None
    });

    let menu = legacy_menu(
        app,
        ["Show/Hide", "Settings", "Open Kimai", "Refresh", "Quit"],
    );
    LEGACY_TRAY.with(|slot| *slot.borrow_mut() = Some(LegacyTray { icon, menu }));
    Ok(())
}
pub(in crate::tray) fn attach_appindicator_popup_activation(app: &AppHandle) -> tauri::Result<()> {
    let tray = app
        .tray_by_id("main")
        .ok_or_else(|| tauri::Error::AssetNotFound("main tray icon".into()))?;
    let handle = app.clone();

    tray.with_inner_tray_icon(move |inner| {
        // tray-icon exposes the AppIndicator wrapper but not its GTK menu.
        // libappindicator itself does expose that menu through its C API. The
        // Rust wrapper contains the raw AppIndicator pointer as its sole field;
        // both crates are locked to the same 0.9 release in Cargo.lock.
        let wrapper = unsafe { inner.app_indicator() };
        let raw = unsafe { *(wrapper.cast::<*mut libappindicator_sys::AppIndicator>()) };
        let menu_ptr = unsafe { libappindicator_sys::app_indicator_get_menu(raw) };
        if menu_ptr.is_null() {
            log::error!("AppIndicator did not expose its GTK menu");
            return;
        }

        let menu: gtk::Menu = unsafe { from_glib_none(menu_ptr) };
        // On Linux with AppIndicator: send middle-click requests through AppIndicator's
        // secondary activation. Forward them to Show/Hide without relying on
        // Tauri's unsupported Linux tray mouse events.
        if let Some(toggle_item) = menu.children().first() {
            unsafe {
                libappindicator_sys::app_indicator_set_secondary_activate_target(
                    raw,
                    toggle_item.to_glib_none().0,
                );
            }
        }
        menu.connect_show(move |menu| {
            // GNOME/Ubuntu owns AppIndicator clicks and only tells the app to
            // show its menu. Treat that signal as activation, close the menu,
            // release GTK's pointer grab, and open the KimaiTray popup instead.
            menu.popdown();
            let handle = handle.clone();
            glib::timeout_add_local_once(Duration::from_millis(50), move || {
                if let Some(display) = gdk::Display::default() {
                    if let Some(seat) = display.default_seat() {
                        seat.ungrab();
                    }
                }
                if !suppress_reopen() {
                    toggle_popup_window(&handle);
                }
            });
        });
    })
}
pub fn create_tray(app: &AppHandle) -> tauri::Result<()> {
    if desktop_needs_appindicator() {
        LINUX_TRAY_BACKEND.store(1, Ordering::SeqCst);
        log::info!("Using AppIndicator tray backend for this Linux desktop");
        super::super::native::create_tauri_tray(app)
    } else {
        log::info!("Using legacy GtkStatusIcon tray backend for this Linux desktop");
        create_legacy_tray(app)
    }
}

pub(in crate::tray) fn update_legacy_menu(
    app: &AppHandle,
    labels: [String; 5],
) -> Result<(), String> {
    let handle = app.clone();
    app.run_on_main_thread(move || {
        LEGACY_TRAY.with(|slot| {
            if let Some(tray) = slot.borrow_mut().as_mut() {
                tray.menu = legacy_menu(
                    &handle,
                    [&labels[0], &labels[1], &labels[2], &labels[3], &labels[4]],
                );
            }
        });
    })
    .map_err(|e| e.to_string())
}
