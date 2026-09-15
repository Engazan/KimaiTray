# macOS 27 tray click compatibility

This is the published `tray-icon` 0.24.2 source, with the macOS changes from
https://github.com/tauri-apps/tray-icon/pull/365 (head `5750c67`) backported.
The original licenses are included. Other platform implementations are unchanged.

macOS 27 swallows left-click events when an NSMenu stays attached to the
NSStatusItem, bypassing `show_menu_on_left_click(false)`:
https://github.com/tauri-apps/tray-icon/issues/355

The menu is retained separately and attached only during presentation, then
detached. Both mouse activation and programmatic `show_menu` use this behavior.
The menu's RefCell borrow is released before AppKit starts its nested event
loop, so changing the menu while it is open does not panic.

Remove this directory and the Cargo `[patch.crates-io]` entry once a released
tray-icon includes this fix, and update Cargo.lock.

## Manual regression checks (macOS 27 and an older supported macOS)

- Default actions: left click opens/closes the popup; right click opens the menu.
- Close the menu with Escape or an item, then left click again.
- Left action `nothing`: left click opens neither menu nor popup.
- Right action `popup`: right click opens/closes the popup.
- Change menu language and click settings, then repeat the checks.
- While the menu is open, trigger a menu update; there must be no borrow panic,
  and the next presentation must show the updated menu.
- Restart with saved click settings and repeat.
