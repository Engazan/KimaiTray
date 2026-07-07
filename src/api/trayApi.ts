import { invoke } from "@tauri-apps/api/core";

export async function setTrayTooltip(text: string): Promise<void> {
  try {
    await invoke("set_tray_tooltip", { text });
  } catch {
    // best-effort
  }
}

export async function setTrayTitle(title: string): Promise<void> {
  try {
    await invoke("set_tray_title", { title });
  } catch {
    // best-effort — title only visible on macOS menu bar
  }
}

export type TrayIconState = "idle" | "running" | "paused" | "error";

export async function startTrayTicker(
  beginSeconds: number,
  project: string,
  activity: string,
  labelStyle: string,
  showSeconds: boolean,
): Promise<void> {
  try {
    await invoke("start_tray_ticker", { beginSeconds, project, activity, labelStyle, showSeconds });
  } catch {
    // best-effort
  }
}

export async function stopTrayTicker(): Promise<void> {
  try {
    await invoke("stop_tray_ticker");
  } catch {
    // best-effort
  }
}

export async function setTrayIcon(state: TrayIconState): Promise<void> {
  try {
    await invoke("set_tray_icon", { state });
  } catch {
    // best-effort
  }
}

export type TrayIconSize = "small" | "medium" | "large";

export async function setTrayIconSize(size: TrayIconSize): Promise<void> {
  try {
    await invoke("set_tray_icon_size", { size });
  } catch {
    // best-effort
  }
}

export async function setPopupVibrancy(enabled: boolean): Promise<void> {
  try {
    await invoke("set_popup_vibrancy", { enabled });
  } catch {
    // best-effort — only works on macOS
  }
}

export async function setPopupSize(width: number, height: number, zoom: number): Promise<void> {
  try {
    await invoke("set_popup_size", { width, height, zoom });
  } catch {
    // best-effort
  }
}

export async function setPopupCornerRadius(radius: number): Promise<void> {
  try {
    await invoke("set_popup_corner_radius", { radius });
  } catch {
    // best-effort — only works on macOS
  }
}

export async function registerShortcuts(shortcuts: {
  togglePopup: string;
  startStopTimer: string;
  openSettings: string;
}): Promise<void> {
  await invoke("register_shortcuts", shortcuts);
}

export async function setDisplayMode(mode: string): Promise<void> {
  try {
    await invoke("set_display_mode", { mode });
  } catch {
    // best-effort
  }
}

export async function setAlwaysOnTop(pinned: boolean): Promise<void> {
  try {
    await invoke("set_always_on_top", { pinned });
  } catch {
    // best-effort
  }
}

export async function setTrayClickActions(leftAction: string, rightAction: string): Promise<void> {
  try {
    await invoke("set_tray_click_actions", { leftAction, rightAction });
  } catch {
    // best-effort
  }
}

export interface MonitorInfo {
  index: number;
  name: string;
  primary: boolean;
}

export async function listMonitors(): Promise<MonitorInfo[]> {
  try {
    return await invoke<MonitorInfo[]>("list_monitors");
  } catch {
    return [];
  }
}

export async function setPopupMonitor(mode: string, index: number, position: string): Promise<void> {
  try {
    await invoke("set_popup_monitor", { mode, index, position });
  } catch {
    // best-effort
  }
}

export async function updateTrayMenu(labels: {
  toggleLabel: string;
  settingsLabel: string;
  openKimaiLabel: string;
  refreshLabel: string;
  quitLabel: string;
}): Promise<void> {
  try {
    await invoke("update_tray_menu", labels);
  } catch {
    // best-effort
  }
}
