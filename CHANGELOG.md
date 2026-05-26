# Changelog

## [0.6.0] - 2026-05-26

### New Features

- **Favorites** — mark any recent task as a favorite with the star icon for one-click timer start; favorites are persisted locally and shown in a dedicated section above recent tasks across all popup layouts (classic, focus, taskbar, timeline)

### Translations

- Added favorites translations for EN, SK, CS, DE, UK

## [0.5.2] - 2026-05-21

### Bug Fixes

- **Fixed "Verification failed" when starting from recent** — active timesheets are now fetched from the server before starting a new timer, eliminating race conditions caused by stale cached state
- **Notes and tags copied from recent entries** — description and tags are now carried over when restarting a timer from the recent tasks list

## [0.5.1] - 2026-05-21

### Improvements

- **Label filter always visible** — the "Filter by labels" field is now always shown in integration settings (disabled with a hint until connection is tested and labels are loaded)

## [0.5.0] - 2026-05-21

### New Features

- **Label filter for issues** — filter issues by labels from your GitLab or GitHub project; available labels are fetched automatically after a successful connection test and displayed as colored, toggleable chips in the integration settings

### Translations

- Added label filter translations for EN, SK, CS, DE, UK

## [0.4.1] - 2026-05-20

### Bug Fixes

- Fixed duplicate "Recent" heading in the tray popup — thanks to [@4713n](https://github.com/4713n) for the contribution ([#1](https://github.com/engazan/KimaiTray/pull/1))

## [0.4.0] - 2026-05-20

### New Features

- **Issue Integration** — optional GitLab/GitHub issue linking when starting timers, with searchable issue picker, per-connection configuration, and action buttons (open in browser, add URL/title to description, copy URL)
- **GitLab Time Sync** — automatically log spent time to the linked GitLab issue when the Kimai timer stops
- **Assigned to me filter** — toggle to show only issues assigned to the authenticated user
- **Issue link in active timer** — when the timer description contains an integration URL, a quick-open button appears next to the description

### Translations

- Added full integration translations for EN, SK, CS, DE, UK

## [0.3.2] - 2026-05-20

### New Features

- **Configurable tray click actions** — left and right click behavior can now be set independently in General settings (toggle popup or do nothing for left; context menu or toggle popup for right); useful for Linux users where left click may not work

### Bug Fixes

- Fixed excessive empty space above and below active timer in Focus layout (removed forced `min-height` and vertical centering from timer area)

## [0.3.1] - 2026-05-20

### Bug Fixes

- Fixed tray icon click handling on Linux — platform-specific code paths for tray events (Linux lacks `MouseButtonState`, so click is handled without button state matching)

## [0.3.0] - 2026-05-19

### New Features

- **Popup Layout Settings** — 4 configurable layout options: Classic, Focus, Taskbar, Timeline
- **UI Size Setting** — choose between Small, Default, and Large popup size (replaces compact toggle)
- **Feature Toggles** — enable/disable note, tags, customer filter, and custom start time from Settings
- **Global Keyboard Shortcuts** — configurable hotkeys with shortcut hints in tray menu
- **Update Settings** — auto-update toggle and manual "Check for Updates" button
- **Linux Tray Support** — Show/Hide menu item for Linux compatibility
- **About Section Links** — GitHub repository and issue tracker links in About

### Bug Fixes

- Shortcuts now fire only on key press (not release)
- Popup correctly positions under the tray icon
- Shortcut hint displayed in tray menu

## [0.2.0] - 2025-12-15

### New Features

- Hide and delete actions for recent tasks
- Searchable select with filtering for task form dropdowns
- Show/Hide menu item for Linux tray compatibility
- Updater and process plugins for auto-updates

### Bug Fixes

- Improved text readability on transparent vibrancy theme
- Build trigger fixed to only run on tag push

## [0.1.1] - 2025-11-01

### Changes

- Renamed KimaiMate to KimaiTray across the application
- Initial time creation fix

## [0.1.0] - 2025-10-01

Initial release.

- Kimai API integration with secure token storage
- System tray with active timer display
- Start/stop/switch tasks from popup
- Recent tasks list
- Today's time tracking history
- Multi-language support
- Multi-connection support
- Tags support
- Fake-pause timer
- Idle detection
- Appearance and timer settings
- Edit current timer
