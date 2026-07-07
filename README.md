<div align="center">

# KimaiTray

A system tray companion for [Kimai](https://www.kimai.org/) time tracking. Start, stop, pause and switch timers without leaving your desktop.

[![Download](https://img.shields.io/github/v/release/Engazan/KimaiTray?label=Download&style=for-the-badge&logo=github)](https://github.com/Engazan/KimaiTray/releases)
[![License](https://img.shields.io/badge/License-MIT-blue?style=for-the-badge)](#license)
![Platforms](https://img.shields.io/badge/Platforms-macOS%20%7C%20Windows%20%7C%20Linux-lightgrey?style=for-the-badge)

### ⬇️ [**Download the latest release**](https://github.com/Engazan/KimaiTray/releases)

![KimaiTray preview](kimai-preview.png)

</div>

Built with [Tauri 2](https://tauri.app/), React 19 and TypeScript.

## Features

- Tray-based timer control (start, stop, pause, resume)
- Multiple Kimai server connections
- Quick-start from recent tasks and favorites
- Issue tracker integration (GitLab, GitHub, Gitea) — search and link issues to timers, browse per-repository issues, filter by state / assignee / labels, see GitLab time estimates (logged vs. estimate), and sync spent time back to the linked issue when the timer stops
- Global keyboard shortcuts
- Idle detection with configurable actions
- Tag and description editing on running timers
- Today's time entry history
- 5 languages (English, Slovak, Czech, German, Ukrainian)
- Customizable appearance (themes, accent colors, compact mode)
- Launch at login
- Cross-platform: macOS, Windows, Linux

## Prerequisites

| Tool | Version |
|------|---------|
| [Node.js](https://nodejs.org/) | 20+ |
| [Rust](https://rustup.rs/) | stable |
| [Tauri CLI](https://tauri.app/start/) | `npm install -g @tauri-apps/cli` (or use `npx`) |

### Platform-specific

**macOS** — Xcode Command Line Tools:
```sh
xcode-select --install
```

**Linux (Debian/Ubuntu)**:
```sh
sudo apt install libwebkit2gtk-4.1-dev libappindicator3-dev librsvg2-dev patchelf
```

**Windows** — [Visual Studio Build Tools](https://visualstudio.microsoft.com/visual-cpp-build-tools/) with "Desktop development with C++" workload. WebView2 is bundled automatically.

## Quick Start

```sh
git clone https://github.com/Engazan/KimaiTray.git
cd KimaiTray
npm install
npm run tauri dev
```

The tray icon appears in your menu bar / system tray. Click it to open the popup.

## Kimai API Token Setup

1. Log into your Kimai instance
2. Go to your profile (click your avatar) -> **API Access**
3. Click **Create** to generate a new API token
4. Copy the token
5. In KimaiTray, click the tray icon -> **Settings** -> **Connection**
6. Enter your Kimai URL (e.g. `https://kimai.example.com`) and paste the token
7. Click **Test & Save**

> Token permissions depend on your Kimai role. Admin or Team Lead roles provide full API access.

## Building for Production

```sh
# Build for the current platform
npm run tauri build

# Build frontend only (staging/production mode)
npm run build:staging
npm run build:prod
```

### Output locations

| Platform | Artifacts |
|----------|-----------|
| macOS | `src-tauri/target/release/bundle/dmg/` and `.app` |
| Windows | `src-tauri/target/release/bundle/nsis/` |
| Linux | `src-tauri/target/release/bundle/appimage/`, `deb/` |

## Environment Configuration

Three environment modes via Vite `.env.*` files:

| File | `VITE_ENV` | `VITE_LOG_LEVEL` |
|------|-----------|-----------------|
| `.env.development` | development | debug |
| `.env.staging` | staging | info |
| `.env.production` | production | warn |

Create `.env.local` or `.env.production.local` for machine-specific overrides (gitignored).

## Project Structure

```
src/                    # React frontend
  api/                  # Kimai REST API client
  components/           # UI components
  hooks/                # Custom React hooks
  integrations/         # Issue tracker integrations
  providers/            # React context providers (React Query)
  settings/             # Settings UI & service
  windows/              # TrayPopup & Settings windows
  shared/i18n/          # Translations (5 languages)
  utils/                # Logger, time formatting
src-tauri/              # Tauri / Rust backend
  src/lib.rs            # App setup, plugin registration
  src/main.rs           # Binary entry point
  src/tray.rs           # System tray, icon generation
  src/shortcuts.rs      # Global keyboard shortcuts
  src/keychain.rs       # API token storage
  src/idle.rs           # Platform idle detection
  tauri.conf.json       # App metadata & bundle config
  capabilities/         # Permission declarations
  icons/                # App icons (icns, ico, png)
```

## Logging

**Rust side**: Uses `tauri-plugin-log` — writes to stdout, log directory, and webview console.
- macOS logs: `~/Library/Logs/eu.engazan.kimaitray/`
- Linux logs: `~/.local/share/eu.engazan.kimaitray/logs/`
- Windows logs: `%APPDATA%/eu.engazan.kimaitray/logs/`

**Frontend**: Import `logger` from `src/utils/logger.ts`. Log level controlled by `VITE_LOG_LEVEL`.

```ts
import { logger } from "./utils/logger";
logger.info("Timer started");
```

## Auto-Updates

KimaiTray checks for updates on startup via GitHub Releases. When a new version is available, an update banner appears in the tray popup.

**Setup for CI signing** (one-time):

1. The signing keys are already generated. The public key is in `tauri.conf.json` -> `plugins.updater.pubkey`
2. Add the private key content (`src-tauri/signer.key`) as a GitHub Secret named `TAURI_SIGNING_PRIVATE_KEY`
3. If the key has a password, also add `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`

The CI workflow automatically signs artifacts and generates `latest.json` on tagged releases.

**To regenerate keys** (invalidates all previous versions):
```sh
npx tauri signer generate -w ./src-tauri/signer.key --ci
```
Update the `pubkey` in `tauri.conf.json` with the new public key.

See the [Tauri Updater docs](https://tauri.app/plugin/updater/) for details.

## CI/CD

GitHub Actions workflow at `.github/workflows/build.yml`:

- Triggers on version tags (`v*`) and manual `workflow_dispatch` runs
- Cross-platform matrix: macOS (ARM + Intel), Linux, Windows
- On version tags (`v*`), creates a draft GitHub Release with all platform artifacts

To release:
```sh
git tag v0.1.0
git push origin v0.1.0
```

Then review and publish the draft release on GitHub.

## Troubleshooting

**macOS: "app is damaged" or Gatekeeper warning**
The app is not code-signed for distribution. Right-click -> Open, or run:
```sh
xattr -cr /Applications/KimaiTray.app
```

**Linux: AppImage won't launch**
```sh
chmod +x KimaiTray_*.AppImage
```
If using Wayland, the tray icon may require an AppIndicator extension.

**Windows: WebView2 missing**
The NSIS installer bundles a WebView2 bootstrapper. If you built manually, install [WebView2 Runtime](https://developer.microsoft.com/en-us/microsoft-edge/webview2/).

**Connection fails with 401**
Your API token may have expired or lack permissions. Generate a new one in Kimai -> Profile -> API Access.

**Idle detection not working on Linux**
Install `xprintidle` for X11-based idle detection:
```sh
sudo apt install xprintidle
```

## License

MIT
