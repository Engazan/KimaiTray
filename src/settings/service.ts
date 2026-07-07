import { load } from "@tauri-apps/plugin-store";
import type { AppSettings } from "../types";

const STORE_PATH = "settings.json";
const SETTINGS_KEY = "settings";

export const defaultSettings: AppSettings = {
  kimaiUrl: "",
  connections: [],
  activeConnectionId: "",

  language: "en",

  launchAtLogin: false,
  refreshInterval: 60,
  openKimaiInBrowser: true,

  showElapsedInTray: true,
  showTaskNameInTray: false,
  menuBarLabelStyle: "timer",
  showSecondsInTimer: true,
  trayIconSize: "medium",
  trayIconShape: "dot",

  enableIdleDetection: false,
  idleThresholdMinutes: 5,
  idleAction: "ask",
  showIdleNotification: true,

  theme: "light",
  uiSize: "default",
  roundedPopupCorners: true,
  reduceVisualEffects: false,
  accentStyle: "blue",
  popupLayout: "classic",
  colorMode: "kimai",

  featureNote: true,
  featureTags: false,
  featurePausedTimerDescriptionHover: false,
  featureCustomerSelect: true,
  featureCustomStartTime: true,

  shortcutTogglePopup: "",
  shortcutStartStopTimer: "",
  shortcutOpenSettings: "",

  trayLeftClickAction: "popup",
  trayRightClickAction: "menu",

  displayMode: "tray",
  trueTrayMode: false,

  popupMonitorMode: "active",
  popupMonitorIndex: 0,
  popupMonitorPosition: "bottom-right",

  autoUpdate: true,

  issueIntegrations: {},
};

let storePromise: ReturnType<typeof load> | null = null;

function getStore() {
  if (!storePromise) {
    storePromise = load(STORE_PATH, { defaults: {}, autoSave: true });
  }
  return storePromise;
}

export async function loadSettings(): Promise<AppSettings> {
  try {
    const store = await getStore();
    const raw = await store.get<AppSettings>(SETTINGS_KEY);
    if (!raw) return { ...defaultSettings };
    const settings = { ...defaultSettings, ...raw };

    const rawObj = raw as unknown as Record<string, unknown>;
    if (rawObj.useCompactPopup !== undefined && !("uiSize" in rawObj)) {
      settings.uiSize = rawObj.useCompactPopup ? "small" : "default";
      await store.set(SETTINGS_KEY, settings);
      await store.save();
    }

    if (settings.kimaiUrl && (!settings.connections || settings.connections.length === 0)) {
      const id = crypto.randomUUID();
      let name = "Kimai";
      try { name = new URL(settings.kimaiUrl).hostname; } catch { /* keep default */ }
      settings.connections = [{ id, name, url: settings.kimaiUrl }];
      settings.activeConnectionId = id;
      await store.set(SETTINGS_KEY, settings);
      await store.save();
    }

    return settings;
  } catch {
    return { ...defaultSettings };
  }
}

export async function saveSettings(settings: AppSettings): Promise<void> {
  const store = await getStore();
  await store.set(SETTINGS_KEY, settings);
  await store.save();
}

export async function onSettingsChange(
  cb: (settings: AppSettings) => void,
): Promise<() => void> {
  const store = await getStore();
  const unlisten = await store.onKeyChange<AppSettings>(SETTINGS_KEY, (val) => {
    cb(val ? { ...defaultSettings, ...val } : { ...defaultSettings });
  });
  return unlisten;
}
