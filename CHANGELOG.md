# Changelog

## [0.18.0] - 2026-07-14

### New Features

- **Expanded UI size range** — the UI Size control in **Appearance** is now a slider with more steps, scaling the whole interface up to 160% (85% / 100% / 115% / 130% / 145% / 160%) instead of the previous three fixed sizes. Useful on high-DPI displays or when you just want everything a bit larger

### Improvements

- **Reliable Linux tray clicks and rendering** — Linux now selects the tray backend for the active desktop: legacy GTK `StatusIcon` restores native left/right clicks on Cinnamon, Xfce and MATE, while GNOME, Ubuntu, Unity, Pantheon and Budgie use AppIndicator where XEmbed icons are unsupported. Popup placement follows the panel edge, the legacy menu uses the modern GDK seat-aware popup API, and the unreliable WebKitGTK DMA-BUF renderer is disabled so accepted clicks, hover states and input changes are actually repainted
- **Adapts to the desktop's capabilities** — the app now detects the platform it runs on (OS, Wayland vs X11 session, and the active tray backend) and adjusts the interface to match. Controls a Wayland compositor doesn't allow — picking the popup's monitor or corner rounding, and registering global shortcuts — now explain why they're unavailable and point you to your desktop's own settings, instead of silently doing nothing

### Bug Fixes

- **Settings apply across every window** — changing a setting now takes effect immediately in all open windows (popup, settings, detached), not just the one where you changed it
- **Rounded popup corners on Linux & Windows** — the tray popup and detached window now render with properly rounded corners on Linux and Windows, matching macOS
- **Popup resizes correctly across UI scales** — on GTK the popup window now resizes to match the selected UI size, so it no longer clips its content or leaves an empty strip
- **Restore a minimized popup from the tray** — clicking the tray icon restores the popup when it was minimized, instead of leaving it hidden
- **Focus timer area can grow** — the timer area in the Focus layout expands to fit its content again

### Maintenance

- **Signed & notarized macOS builds** — macOS builds are now signed with a Developer ID certificate and notarized by Apple (both the `.app` and the `.dmg`), so downloaded DMGs no longer trip Gatekeeper's "damaged / Move to Trash" warning

## [0.17.2] - 2026-07-12

### Bug Fixes

- **Paused timers work again** — pausing a timer, seeing your paused timers and resuming them stopped working after 0.17.0 moved the store to the native layer. The request that loads paused timers used the wrong field names, so it silently returned nothing and no paused-timer cards ever appeared. Pausing now keeps the timer as a resumable amber card again, previously paused timers reappear, and resume/discard work as before
- **Paused timer list fits the Focus layout** — in the Focus menu-bar layout the paused timers now get their own scrollable list instead of being squeezed into the fixed-height timer band. Several are shown at once as a compact list, any extras scroll (with a soft fade at the edge), and there is no longer an empty strip below them when no timer is running

## [0.17.1] - 2026-07-12

### Maintenance

- **Dependency security updates** — bumped bundled dependencies to clear reported advisories, with no user-facing behavior changes: `plist` (1.10.0) and `tauri-winrt-notification` (0.7.3), which remove the vulnerable `quick-xml` copies ([RUSTSEC-2026-0194](https://rustsec.org/advisories/RUSTSEC-2026-0194.html), [RUSTSEC-2026-0195](https://rustsec.org/advisories/RUSTSEC-2026-0195.html)), and `anyhow` (1.0.103) for a soundness fix ([RUSTSEC-2026-0190](https://rustsec.org/advisories/RUSTSEC-2026-0190.html))
- **CI/build fixes** — resolved a Clippy lint (`filter_next`) in the Linux idle-time parser that was failing the Linux build, and removed the Dependabot configuration

## [0.17.0] - 2026-07-12

### New Features

- **Category pictograms & accent colors** — each Category Mode button can now carry a pictogram (18 built-in icons) and an accent color, set from a small visual editor next to the category. The chosen pictogram and color show up on the buttons in the menu bar, making the category tree quicker to scan. Translated across all five languages
- **Idle detection on Linux/Wayland** — automatic idle-time detection now works on Wayland sessions (via the idle-notify protocol), not just X11, so the idle prompt fires correctly on modern Linux desktops

### Improvements

- **Security & reliability hardening** — a broad pass over how the app stores data and talks to the network. All requests to your Kimai server and issue trackers are now brokered through the native layer with validated, pinned DNS targets and authorized origins; credentials live only in the OS secure store (with legacy tokens migrated and scrubbed atomically); and each connection's cached data, paused timers and issue-integration credentials are fully isolated, so switching or removing a connection can no longer leak state between them. Store writes are serialized and applied atomically across windows, with rollback if a save fails
- **Reorganized Category Mode settings** — the settings screen is split into clear **Behavior**, **Category source**, **Category tree** and **Data tools** sections, with an inline editor for building the tree and mapping each subcategory to a Kimai activity
- **Configurable tray label styles** — the menu-bar label now honors the configured label style

### Bug Fixes

- **Correct timer times sent to Kimai** — timer start/stop times are now sent in local wall-clock format so entries land at the time you actually tracked them, and a custom start time set on the New Task form is applied correctly
- **Recorded duration synced to linked issues** — stopping a timer now writes the recorded duration back to its linked issue
- **Relative dates across DST** — "today"/"yesterday" grouping of recent tasks is now computed correctly across daylight-saving changes
- **Category Mode layout stability** — fixed drilldown sizing and popup layout jumps when navigating the category tree
- **Accessibility** — focus is now trapped in the idle and date-picker dialogs, and keyboard navigation and form semantics were improved throughout
- **Shortcuts restored after a failed registration** — global shortcuts are re-registered correctly if a registration attempt fails

## [0.16.0] - 2026-07-09

### New Features

- **Category Mode** — an optional, per-connection menu-bar mode that replaces the recent/favorites lists with a configurable two-level category tree mapped onto your Kimai activities. Drill from a category to a subcategory (picking the client/project when one is required) to start tracking — the previous timer is stopped automatically, and a "continue last activity" window lets you pick straight back up. Categories are name-mapped to activities and resolved per project. A built-in visual editor supports Export / Import / Reset and raw JSON, and you can optionally load the tree from a URL with hourly auto-sync (which hides the manual editor while the categories are managed remotely). Off by default; translated across all five languages
- **Customizable tray icon colors** — a new **Tray icon colors** setting in **Tray & Menu Bar** lets you pick the status-icon color for each timer state (running, paused, idle and error). Each state opens a color picker with a curated preset palette, a hex input, and a full-range OS picker; your choices are saved and re-applied on startup. Defaults match the previous colors, and the labels are translated across all five languages

### Improvements

- **Redesigned settings** — every settings section is rebuilt on a new card-based design system for a cleaner, more consistent look. The sidebar is reorganized into logical groups with app branding, the content is centered responsively, and the settings window is now resizable (with sensible minimum bounds)
- **Integrations are now a browsable list** — a connection's **Integrations** tab lists the available integrations (currently Git Issues) and opens a dedicated configuration screen for each, backed by an extensible registry so more can be added over time
- **Simpler new-timer form** — the New Task form was reworked for a cleaner, less cluttered feel: a clearer header, Project and Activity as the primary fields, and the less-used Tags and custom start time tucked into a collapsible **More options** drawer (with an indicator dot when it holds something). Start is now the full-width primary action, and the project / activity / customer pickers show each item's Kimai color as a swatch

## [0.15.0] - 2026-07-08

### New Features

- **Per-connection feature toggles** — the feature toggles (note, tags, paused-timer description hover, customer select, custom start time) are now configured **per connection** on the connection page as a **Features** tab (next to Connection and Integrations), instead of a single global setting in the sidebar. Each connection keeps its own set; existing global values are migrated onto every current connection automatically
- **Tray icon style presets** — pick the shape of the status icon in **Tray & Menu Bar**: **Dot** (filled circle), **Ring** (hollow circle), **Square** (rounded square) or **Clock** (a clock face, fitting for a time tracker). Every preset keeps the state color (idle / running / paused / error) and the icon-size setting

### Bug Fixes

- **Sharper, larger menu bar icon** ([#8](https://github.com/Engazan/KimaiTray/issues/8)) — the tray status icon is now rendered at a high pixel resolution with proper anti-aliasing, so it no longer looks blurry on Retina displays, and a darker rim gives it a crisp, higher-contrast edge on both light and dark menu bars. A new **Tray icon size** setting (Small / Medium / Large / X-Large) in **Tray & Menu Bar** lets you make the icon bigger

## [0.14.0] - 2026-07-07

### New Features

- **Independent connections to the same server** — you can now add the same Kimai server more than once as separate connections, each with its own API token, cached data (projects, activities, timesheets) and paused timers. Per-connection state is keyed by the connection instead of the server URL, so two connections with different tokens no longer overwrite each other; existing tokens are migrated automatically
- **Issue integration moved into the connection page** — a connection's issue-tracker settings now live on that connection's page as an **Integrations** tab (next to the connection form) instead of a separate sidebar section, since integrations are configured per connection. The tab unlocks once the connection is saved

## [0.13.0] - 2026-07-07

### New Features

- **Issues matching the selected project are highlighted** — when you pick a project in the new-timer form, issues whose title contains the project name (e.g. project `eshop.siklienka.sk` → issue "ANALYZA - eshop.siklienka.sk - Individuálne akcie") are marked with an accent bar and the first match is pre-selected, since it's likely the one you want

### Bug Fixes

- **Substring & accent-insensitive issue search** — searching GitLab issues now matches substrings anywhere in the title (e.g. "sik" finds "siklienka") and ignores diacritics (e.g. "individualne" finds "Individuálne"), instead of relying on GitLab's whole-word server-side search

## [0.12.1] - 2026-07-01

### Bug Fixes

- **Hover contrast fixes** — the favorites star no longer turns a hard-to-see grey on hover (it stays amber and only reddens on the remove button), and the too-faint hover highlight on the new-timer form's buttons and dropdowns (project / activity / customer / tags / issues) is now clearly visible
- **Time estimate when starting from recents** — starting a timer from a recent task now shows the linked issue's time estimate

## [0.12.0] - 2026-06-26

### New Features

- **GitLab time estimates** — issues now show the time already logged against the estimate (e.g. `1h / 5h`), pulled straight from GitLab's time tracking with no extra requests. The badge appears next to each issue in the picker and turns red when the estimate is exceeded
- **Live time budget on the active timer** — the running timer card shows a live spent/estimate badge (logged time plus the current session) so you can see how much of the estimate is left at a glance; it survives popup reloads and app restarts by restoring the linked issue and refreshing its stats from GitLab

### Improvements

- **"Show time estimate" setting** — toggle the estimate badges per connection in the Integrations settings; enabled by default for GitLab

## [0.11.0] - 2026-06-24

### Improvements

- **Connections moved into the settings sidebar** — your saved Kimai connections are now listed directly in the settings sidebar, each showing its name, URL and an indicator for the active connection. Click a connection to jump straight to editing it
- **Refined issue integration settings layout** — reorganized the Integrations settings for a cleaner, easier-to-scan layout

## [0.10.0] - 2026-06-24

### New Features

- **Gitea issue integration** — link Gitea issues to your time entries alongside the existing GitLab and GitHub providers. Supports issue search, open/all state and assignee filtering, include/exclude label filters, and **spent-time sync** to the linked issue when the timer stops (Gitea's native time-tracking endpoint), mirroring the GitLab integration
- **macOS True Tray mode** — hide the app from the Dock and Cmd+Tab so KimaiTray lives purely in the menu bar

### Improvements

- **Pick the project / repository from a list** — instead of typing the project path or repo by hand, load and search the projects/repositories your token can access (GitLab projects, GitHub & Gitea repos) and pick one; manual entry is still available as a fallback. The settings field is now the **default repository**, and the new-timer form has its own repository picker so you can browse another repo's issues per timer without changing the default
- **Pick the connection to configure directly in Integrations settings** — a connection picker (as tabs) at the top of the Integrations section lets you edit any connection's issue-integration settings without first switching the active connection elsewhere; the active connection is marked
- **API version shown per integration provider** — the Integrations settings now display which API version each provider targets (GitLab v4, GitHub REST v3, Gitea v1) under the provider selector
- **Issue integration requests now go through the native HTTP layer** — GitLab, GitHub and Gitea API calls are routed via the Tauri HTTP plugin instead of the webview's `fetch`, so they are no longer subject to browser CORS restrictions. This fixes "Connection failed" against self-hosted instances (e.g. a local Gitea at `http://localhost:3000`) that don't send permissive CORS headers

## [0.9.0] - 2026-06-17

### New Features

- **Pick tags from existing Kimai tags** — the tag field is now a searchable select that lists the tags already defined in Kimai, complete with their colors, and supports adding multiple tags. Kimai only attaches tags that already exist, so picking from the list ensures the tags actually stick
- **Per-connection favorites** — favorite tasks are now scoped to the active connection instead of being shared globally; existing favorites are migrated onto the current connection on first launch
- **Test settings section** — a new section with a tool to move favorites from one connection to another (handy when migrating to a new Kimai server)
- **Refresh button in the New Task form** — reloads the projects, activities and tags lists on demand

### Bug Fixes

- **Fixed elapsed time calculation on macOS** — Kimai serializes timezone offsets without a colon (e.g. `+0200`), which the macOS webview did not parse reliably; datetimes are now normalized so the elapsed time is correct
- **Fixed UI jumping when deleting a recent task** — the delete confirmation now keeps the row's original height instead of collapsing to a single line

## [0.8.2] - 2026-06-17

### Improvements

- **Changed the default language to English** — fresh installs without a saved language preference now start in English instead of Slovak

### Documentation

- **Added a download section to the README** — release badges and a prominent link to the [releases page](https://github.com/Engazan/KimaiTray/releases) at the top
- **Corrected the README** — fixed the CI/CD trigger description (runs on version tags and manual dispatch, not on push/PR) and filled in missing entries in the project structure

## [0.8.1] - 2026-06-15

### Bug Fixes

- **Completed the KimaiMate → KimaiTray rename** — fixed the bundle identifier (`eu.engazan.kimaimate` → `eu.engazan.kimaitray`), the window title and the About links so the app, its data directory and its resources are consistently named KimaiTray. Existing settings, API tokens, favorites, hidden tasks and paused timers are migrated automatically on first launch after updating, so no data is lost
- **Fixed Recent/Today tab bar background in transparent theme** — replaced the opaque white background with frosted glass so macOS vibrancy shows through instead of a solid bar
- **Updated the application icon** — new icon with proper macOS safe-area padding so it no longer renders oversized in the Dock and the app switcher

## [0.8.0] - 2026-06-12

### New Features

- **Configurable Linux popup monitor placement** — added tray popup settings for choosing the active monitor or a specific monitor, with corner/center placement options

### Improvements

- **README preview image** — added an application preview image to the README

### Bug Fixes

- **Fixed custom start time picker clipping** — rendered the date/time picker as an overlay so it stays usable inside constrained popup layouts — thanks to [@4713n](https://github.com/4713n) ([#4](https://github.com/Engazan/KimaiTray/pull/4))
- **Fixed tray content accessibility with multiple paused timers** — made the timer area scroll independently so recent tasks and today entries remain reachable — thanks to [@4713n](https://github.com/4713n) ([#5](https://github.com/Engazan/KimaiTray/pull/5))
- **Fixed idle dialog refresh after stopping timers** — invalidated timesheet cache after idle-dialog stop/discard actions and guarded dialog display when no Kimai client is available

### Translations

- Added popup monitor placement translations for EN, SK, CS, DE, UK

## [0.7.2] - 2026-05-28

### New Features

- **Paused timer description hover** — new setting to show the timer description as a tooltip when hovering over a paused timer

### Bug Fixes

- **Fixed elapsed timer freezing on Linux** — prevented elapsed timer from freezing in detached mode on Linux

## [0.7.1] - 2026-05-27

### Bug Fixes

- **Fixed Windows build warning** — gated macOS-only vibrancy static behind `cfg(target_os = "macos")` to silence unused import warning on Windows builds

## [0.7.0] - 2026-05-27

### New Features

- **Auto-insert issue URL** — new toggle in integration settings to automatically add the issue URL to the timer description when selecting an issue in the new task form
- **Timer card animations** — smooth slide-in/fade entry and exit animations on active timer, paused timer, and empty state cards (respects "reduce visual effects" setting)

### Bug Fixes

- **Reduced popup flickering** — position the popup window before showing instead of show-then-reposition, eliminating the visible flash on open
- **Batched query invalidation** — consolidated triple `invalidateQueries` calls into a single predicate-based invalidation across all hooks to reduce cascading re-renders
- **Skipped redundant native calls** — `useAppearance` now caches previous values and skips unchanged `setPopupSize`/`setPopupVibrancy`/`setPopupCornerRadius`/`setDisplayMode` calls
- **Fixed horizontal scroll in new task form** — prevented overflow when selecting an issue with a long title in the issue picker

### Translations

- Added auto-insert URL translations for EN, SK, CS, DE, UK

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
