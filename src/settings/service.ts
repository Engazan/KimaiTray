import { load } from "@tauri-apps/plugin-store";
import { invoke } from "@tauri-apps/api/core";
import type { AppSettings, FeatureSettings, TrayStateColors } from "../types";

const STORE_PATH = "settings.json";
const SETTINGS_KEY = "settings";

// Default tray status-icon colors, mirroring the fallbacks in tray.rs.
export const defaultTrayColors: TrayStateColors = {
  idle: "#9ca3af", // gray-400
  running: "#10b981", // emerald-500
  paused: "#f59e0b", // amber-500
  error: "#ef4444", // red-500
};

export const defaultFeatureSettings: FeatureSettings = {
  featureNote: true,
  featureTags: false,
  featurePausedTimerDescriptionHover: false,
  featureCustomerSelect: true,
  featureCustomStartTime: true,
  featureCategoryMode: false,
};

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
  trayColors: { ...defaultTrayColors },

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

  features: {},

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

export function mergeSettings(raw?: Partial<AppSettings> | null): AppSettings {
  if (!raw) return {
    ...defaultSettings,
    trayColors: { ...defaultSettings.trayColors },
    features: {},
    issueIntegrations: {},
  };
  return {
    ...defaultSettings,
    ...raw,
    connections: Array.isArray(raw.connections) ? raw.connections : [],
    trayColors: {
      ...defaultSettings.trayColors,
      ...(raw.trayColors ?? {}),
    },
    features: { ...(raw.features ?? {}) },
    issueIntegrations: { ...(raw.issueIntegrations ?? {}) },
  };
}

export async function loadSettings(): Promise<AppSettings> {
  try {
    const store = await getStore();
    const raw = await store.get<AppSettings>(SETTINGS_KEY);
    if (!raw) return mergeSettings();
    const settings = mergeSettings(raw);

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

    // Migrate the old global feature toggles into per-connection settings by
    // copying the previous values onto every existing connection once.
    // Clone so we never mutate the shared `defaultSettings.features` object.
    settings.features = { ...(settings.features ?? {}) };
    const hadFlatFeatures =
      rawObj.featureNote !== undefined ||
      rawObj.featureTags !== undefined ||
      rawObj.featurePausedTimerDescriptionHover !== undefined ||
      rawObj.featureCustomerSelect !== undefined ||
      rawObj.featureCustomStartTime !== undefined;
    if (hadFlatFeatures && Object.keys(settings.features).length === 0) {
      const migrated: FeatureSettings = {
        featureNote: (rawObj.featureNote as boolean) ?? defaultFeatureSettings.featureNote,
        featureTags: (rawObj.featureTags as boolean) ?? defaultFeatureSettings.featureTags,
        featurePausedTimerDescriptionHover:
          (rawObj.featurePausedTimerDescriptionHover as boolean) ??
          defaultFeatureSettings.featurePausedTimerDescriptionHover,
        featureCustomerSelect:
          (rawObj.featureCustomerSelect as boolean) ?? defaultFeatureSettings.featureCustomerSelect,
        featureCustomStartTime:
          (rawObj.featureCustomStartTime as boolean) ?? defaultFeatureSettings.featureCustomStartTime,
        featureCategoryMode: defaultFeatureSettings.featureCategoryMode,
      };
      for (const conn of settings.connections ?? []) {
        settings.features[conn.id] = { ...migrated };
      }
      await store.set(SETTINGS_KEY, settings);
      await store.save();
    }

    // Migrate the per-connection toggle from the old "CS Mode" name.
    let migratedCategoryMode = false;
    for (const [id, feat] of Object.entries(settings.features)) {
      const legacy = (feat as { featureCsMode?: boolean }).featureCsMode;
      if (legacy !== undefined && feat.featureCategoryMode === undefined) {
        settings.features[id] = { ...feat, featureCategoryMode: legacy };
        delete (settings.features[id] as { featureCsMode?: boolean }).featureCsMode;
        migratedCategoryMode = true;
      }
    }
    if (migratedCategoryMode) {
      await store.set(SETTINGS_KEY, settings);
      await store.save();
    }

    return settings;
  } catch {
    return mergeSettings();
  }
}

export async function patchSettings(
  values: Partial<AppSettings>,
  expected?: Partial<AppSettings>,
): Promise<AppSettings> {
  const response = await invoke<{ value: Partial<AppSettings> }>(
    "patch_settings",
    { request: { values, expected } },
  );
  return mergeSettings(response.value);
}

export async function onSettingsChange(
  cb: (settings: AppSettings) => void,
): Promise<() => void> {
  const store = await getStore();
  const unlisten = await store.onKeyChange<AppSettings>(SETTINGS_KEY, (val) => {
    cb(mergeSettings(val));
  });
  return unlisten;
}
