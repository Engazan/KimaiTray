# Native tray subsystem

`../tray.rs` is the subsystem entry point. It loads startup settings once,
initializes the owning modules, creates the selected backend, and starts the
native ticker. It also keeps the shared icon/menu configuration lock and the
lifecycle API used by the application and shortcuts.

| Module | Responsibility and owned state |
| --- | --- |
| `icons.rs` | Icon state, size, shape, colors and RGBA rendering. Backends receive an initial bitmap without accessing these atomics. |
| `ticker.rs` | Running timer snapshot, native ticker thread, tooltip and title commands. |
| `menu.rs` | Tauri menu construction, translated labels, click preferences and their commands. |
| `popup.rs` | Focus/resize dismissal, detached mode, monitor selection, sizing and popup lifecycle. |
| `actions.rs` | Shared refresh, settings-window and validated browser actions for both backends. |
| `native.rs` | Tauri tray construction and native menu/click event wiring. |
| `platform/linux.rs` | GTK status-icon ownership, AppIndicator activation, pointer grabs, Linux interaction and legacy positioning. |
| `platform/macos.rs` | AppKit interaction, True Tray activation policy, display scale, positioning, vibrancy and corners. |
| `platform/windows.rs` | Win32 foreground/pointer/resize interaction queries. |
| `platform/mod.rs` | Selects OS adapters and supplies shared physical-coordinate positioning and unsupported-appearance no-ops. |
| `platform/backend_choice.rs` | Pure Linux backend selection; its tests run on every host. |

## Boundaries to preserve

- Mutable state stays private to its owner. Siblings use operations or snapshots,
  not another module's atomics.
- GTK objects remain in thread-local storage. Ticker-originated GTK writes and
  popup dismissal queries must continue to run on the UI thread.
- Icon and menu configuration commands retain the common transaction lock.
- Startup uses the same initial settings for both Linux backends and the native
  backend. Create exactly one ticker after successful backend creation.
- `lib.rs` registers commands through their owning module paths. The 19 frontend
  IPC command names and argument shapes remain unchanged.
- `crate::platform` remains the application-wide capability detector; this
  directory's `platform` module contains tray-specific OS implementation details.

Unit tests live next to their owning logic. `cargo test`, `cargo clippy
--all-targets -- -D warnings`, and a desktop build validate the local target.
The existing CI matrix compiles and tests Linux, macOS and Windows separately;
a local macOS build cannot validate GTK or Win32 runtime behavior.
