use objc2::{
    define_class,
    rc::Retained,
    runtime::{NSObjectProtocol, ProtocolObject},
    MainThreadOnly, Message,
};
use objc2_app_kit::{
    NSBackingStoreType, NSPanel, NSPopUpMenuWindowLevel, NSView, NSWindow,
    NSWindowCollectionBehavior as Behavior, NSWindowDelegate, NSWindowStyleMask,
};
use objc2_foundation::NSNotification;
use std::cell::RefCell;
use tauri::WebviewWindow;

struct PanelState {
    original: Retained<NSWindow>,
    panel: Retained<TrayPanel>,
}

thread_local! {
    static PANEL: RefCell<Option<PanelState>> = const { RefCell::new(None) };
}

define_class!(
    // SAFETY: This class adds no ivars and uses AppKit's designated initializer.
    #[unsafe(super(NSPanel))]
    #[thread_kind = MainThreadOnly]
    struct TrayPanel;

    impl TrayPanel {
        #[unsafe(method(canBecomeKeyWindow))]
        fn can_become_key(&self) -> bool {
            true
        }

        #[unsafe(method(canBecomeMainWindow))]
        fn can_become_main(&self) -> bool {
            false
        }
    }

    unsafe impl NSObjectProtocol for TrayPanel {}

    // SAFETY: The callbacks run on the AppKit main thread.
    unsafe impl NSWindowDelegate for TrayPanel {
        #[allow(non_snake_case)]
        #[unsafe(method(windowDidBecomeKey:))]
        fn windowDidBecomeKey(&self, notification: &NSNotification) {
            if let Some(delegate) = original_delegate() {
                delegate.windowDidBecomeKey(notification);
            }
        }

        #[allow(non_snake_case)]
        #[unsafe(method(windowDidResignKey:))]
        fn windowDidResignKey(&self, notification: &NSNotification) {
            if let Some(delegate) = original_delegate() {
                delegate.windowDidResignKey(notification);
            }
        }

        #[allow(non_snake_case)]
        #[unsafe(method(windowDidResize:))]
        fn windowDidResize(&self, _notification: &NSNotification) {
            let original = PANEL.with_borrow(|state| state.as_ref().map(|s| s.original.clone()));
            if let Some(original) = original {
                // Let the original Tauri window emit its usual resize event.
                if original.frame() != self.frame() {
                    original.setFrame_display(self.frame(), false);
                }
            }
        }
    }
);

fn original_delegate() -> Option<Retained<ProtocolObject<dyn NSWindowDelegate>>> {
    PANEL.with_borrow(|state| state.as_ref()?.original.delegate())
}

pub(in crate::tray) fn panel_window() -> Option<Retained<NSWindow>> {
    PANEL.with_borrow(|state| {
        state
            .as_ref()
            .map(|s| Retained::into_super(s.panel.clone()).into_super())
    })
}

fn create_panel(original: &NSWindow) -> Option<Retained<TrayPanel>> {
    let content = original.contentView()?;
    let allocated = TrayPanel::alloc(original.mtm()).set_ivars(());
    // SAFETY: The allocated object is an NSPanel subclass. Initialize it with
    // NonactivatingPanel set from the outset so AppKit configures focus correctly.
    let panel: Retained<TrayPanel> = unsafe {
        objc2::msg_send![
            super(allocated),
            initWithContentRect: original.frame(),
            styleMask: NSWindowStyleMask::Resizable | NSWindowStyleMask::NonactivatingPanel,
            backing: NSBackingStoreType::Buffered,
            defer: false,
        ]
    };
    // SAFETY: The panel lifetime is managed solely by Retained.
    unsafe { panel.setReleasedWhenClosed(false) };
    panel.setFloatingPanel(true);
    panel.setHidesOnDeactivate(false);
    panel.setLevel(NSPopUpMenuWindowLevel);
    panel.setHasShadow(original.hasShadow());
    panel.setOpaque(original.isOpaque());
    panel.setBackgroundColor(Some(&original.backgroundColor()));
    let mut behavior =
        Behavior::CanJoinAllSpaces | Behavior::FullScreenAuxiliary | Behavior::Transient;
    if objc2::available!(macos = 13.0) {
        behavior.insert(Behavior::CanJoinAllApplications);
    }
    panel.setCollectionBehavior(behavior);

    original.orderOut(None);
    // Tao expects its native window to retain a content view even while hidden.
    let placeholder = NSView::initWithFrame(original.mtm().alloc(), content.frame());
    original.setContentView(Some(&placeholder));
    panel.setContentView(Some(&content));
    panel.setDelegate(Some(ProtocolObject::from_ref(&*panel)));
    PANEL.with_borrow_mut(|state| {
        *state = Some(PanelState {
            original: original.retain(),
            panel: panel.clone(),
        });
    });
    Some(panel)
}

pub(in crate::tray) fn show(window: &WebviewWindow) -> tauri::Result<()> {
    window.with_webview(|webview| {
        let existing = PANEL.with_borrow(|state| {
            state
                .as_ref()
                .map(|s| (s.original.clone(), s.panel.clone()))
        });
        let (original, panel) = match existing {
            Some(windows) => windows,
            None => {
                // SAFETY: Tauri owns this window and the callback runs on the UI thread.
                let Some(original) = (unsafe { webview.ns_window().cast::<NSWindow>().as_ref() })
                else {
                    return;
                };
                let Some(panel) = create_panel(original) else {
                    log::warn!("Cannot create tray panel: original content view is unavailable");
                    return;
                };
                (original.retain(), panel)
            }
        };
        sync_frame(&original, &panel);
        panel.orderFrontRegardless();
        panel.makeKeyWindow();
        log::debug!(
            "Tray panel presented: active_space={}, key={}",
            panel.isOnActiveSpace(),
            panel.isKeyWindow()
        );
    })
}

fn sync_frame(original: &NSWindow, panel: &NSWindow) {
    let frame = original.frame();
    panel.setContentMinSize(original.contentMinSize());
    panel.setContentMaxSize(original.contentMaxSize());
    if panel.frame() != frame {
        panel.setFrame_display(frame, true);
    }
}

pub(in crate::tray) fn sync_size(window: &WebviewWindow) -> tauri::Result<()> {
    window.with_webview(|_| {
        let windows = PANEL.with_borrow(|state| {
            state
                .as_ref()
                .map(|s| (s.original.clone(), s.panel.clone()))
        });
        if let Some((original, panel)) = windows {
            sync_frame(&original, &panel);
        }
    })
}

pub(in crate::tray) fn restore_window(window: &WebviewWindow) -> tauri::Result<()> {
    window.with_webview(|_| {
        if let Some(state) = PANEL.take() {
            state.panel.setDelegate(None);
            state.panel.orderOut(None);
            if let Some(content) = state.panel.contentView() {
                state.panel.setContentView(None);
                state.original.setContentView(Some(&content));
            }
            state.panel.close();
        }
    })
}
