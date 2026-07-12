import { load } from "@tauri-apps/plugin-store";
import { invoke } from "@tauri-apps/api/core";
import type {
  AppSettings,
  FeatureSettings,
  IssueIntegrationSettings,
  SavedConnection,
  TrayStateColors,
} from "../types";

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

async function persistMigratedSettings(
  store: Awaited<ReturnType<typeof getStore>>,
  settings: AppSettings,
): Promise<void> {
  try {
    await store.set(SETTINGS_KEY, settings);
    await store.save();
  } catch {
    // The normalized in-memory settings remain usable. A later startup can
    // retry this idempotent migration when persistence is available again.
  }
}

type UnknownRecord = Record<string, unknown>;

function isRecord(value: unknown): value is UnknownRecord {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function stringValue(value: unknown, fallback: string, maximum = 4096): string {
  return typeof value === "string" && value.length <= maximum ? value : fallback;
}

function booleanValue(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

function enumValue<T extends string>(
  value: unknown,
  allowed: readonly T[],
  fallback: T,
): T {
  return typeof value === "string" && allowed.includes(value as T)
    ? (value as T)
    : fallback;
}

function integerValue(
  value: unknown,
  fallback: number,
  minimum: number,
  maximum: number,
): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
  return Math.min(maximum, Math.max(minimum, Math.round(value)));
}

function numberEnumValue(
  value: unknown,
  allowed: readonly number[],
  fallback: number,
): number {
  return typeof value === "number" && allowed.includes(value) ? value : fallback;
}

function normalizeConnections(value: unknown): SavedConnection[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const connections: SavedConnection[] = [];
  for (const item of value) {
    if (!isRecord(item)) continue;
    const id = stringValue(item.id, "", 256);
    const name = stringValue(item.name, "", 256);
    const url = stringValue(item.url, "", 4096);
    if (!id || !name || !url || seen.has(id)) continue;
    seen.add(id);
    connections.push({ id, name, url });
  }
  return connections;
}

function normalizeTrayColors(value: unknown): TrayStateColors {
  const raw = isRecord(value) ? value : {};
  const color = (key: keyof TrayStateColors) => {
    const candidate = stringValue(raw[key], defaultTrayColors[key], 7);
    return /^#[0-9a-f]{6}$/i.test(candidate)
      ? candidate
      : defaultTrayColors[key];
  };
  return {
    idle: color("idle"),
    running: color("running"),
    paused: color("paused"),
    error: color("error"),
  };
}

function normalizeFeatures(value: unknown): Record<string, FeatureSettings> {
  if (!isRecord(value)) return {};
  const normalized: Record<string, FeatureSettings> = {};
  for (const [id, featureValue] of Object.entries(value)) {
    if (!id || id.length > 256 || !isRecord(featureValue)) continue;
    normalized[id] = {
      featureNote: booleanValue(
        featureValue.featureNote,
        defaultFeatureSettings.featureNote,
      ),
      featureTags: booleanValue(
        featureValue.featureTags,
        defaultFeatureSettings.featureTags,
      ),
      featurePausedTimerDescriptionHover: booleanValue(
        featureValue.featurePausedTimerDescriptionHover,
        defaultFeatureSettings.featurePausedTimerDescriptionHover,
      ),
      featureCustomerSelect: booleanValue(
        featureValue.featureCustomerSelect,
        defaultFeatureSettings.featureCustomerSelect,
      ),
      featureCustomStartTime: booleanValue(
        featureValue.featureCustomStartTime,
        defaultFeatureSettings.featureCustomStartTime,
      ),
      featureCategoryMode: booleanValue(
        featureValue.featureCategoryMode,
        defaultFeatureSettings.featureCategoryMode,
      ),
    };
  }
  return normalized;
}

const defaultIssueIntegration: IssueIntegrationSettings = {
  enabled: false,
  provider: "gitlab",
  baseUrl: "",
  apiBaseUrl: "",
  projectPathOrRepo: "",
  defaultState: "opened",
  assigneeOnly: false,
  syncTime: false,
  autoInsertUrl: false,
  showTimeEstimate: true,
  filterLabels: [],
  filterLabelsMode: "include",
};

function normalizeIssueIntegrations(
  value: unknown,
): Record<string, IssueIntegrationSettings> {
  if (!isRecord(value)) return {};
  const normalized: Record<string, IssueIntegrationSettings> = {};
  for (const [id, integrationValue] of Object.entries(value)) {
    if (!id || id.length > 256 || !isRecord(integrationValue)) continue;
    normalized[id] = {
      enabled: booleanValue(integrationValue.enabled, false),
      provider: enumValue(
        integrationValue.provider,
        ["gitlab", "github", "gitea"] as const,
        defaultIssueIntegration.provider,
      ),
      baseUrl: stringValue(integrationValue.baseUrl, ""),
      apiBaseUrl: stringValue(integrationValue.apiBaseUrl, ""),
      projectPathOrRepo: stringValue(integrationValue.projectPathOrRepo, ""),
      defaultState: enumValue(
        integrationValue.defaultState,
        ["opened", "all"] as const,
        defaultIssueIntegration.defaultState,
      ),
      assigneeOnly: booleanValue(integrationValue.assigneeOnly, false),
      syncTime: booleanValue(integrationValue.syncTime, false),
      autoInsertUrl: booleanValue(integrationValue.autoInsertUrl, false),
      showTimeEstimate: booleanValue(integrationValue.showTimeEstimate, true),
      filterLabels: Array.isArray(integrationValue.filterLabels)
        ? integrationValue.filterLabels.filter(
            (label): label is string =>
              typeof label === "string" && label.length <= 256,
          )
        : [],
      filterLabelsMode: enumValue(
        integrationValue.filterLabelsMode,
        ["include", "exclude"] as const,
        defaultIssueIntegration.filterLabelsMode,
      ),
    };
  }
  return normalized;
}

export function mergeSettings(raw?: Partial<AppSettings> | null): AppSettings {
  if (!raw) return {
    ...defaultSettings,
    trayColors: { ...defaultSettings.trayColors },
    features: {},
    issueIntegrations: {},
  };
  const value = raw as unknown as UnknownRecord;
  const connections = normalizeConnections(value.connections);
  const activeConnectionId = stringValue(value.activeConnectionId, "", 256);
  return {
    kimaiUrl: stringValue(value.kimaiUrl, ""),
    connections,
    activeConnectionId: connections.some((item) => item.id === activeConnectionId)
      ? activeConnectionId
      : "",
    language: enumValue(
      value.language,
      ["sk", "en", "cs", "de", "uk", "system"] as const,
      defaultSettings.language,
    ),
    launchAtLogin: booleanValue(value.launchAtLogin, defaultSettings.launchAtLogin),
    refreshInterval: numberEnumValue(
      value.refreshInterval,
      [15, 30, 60, 120, 300, 600],
      defaultSettings.refreshInterval,
    ),
    openKimaiInBrowser: booleanValue(
      value.openKimaiInBrowser,
      defaultSettings.openKimaiInBrowser,
    ),
    showElapsedInTray: booleanValue(
      value.showElapsedInTray,
      defaultSettings.showElapsedInTray,
    ),
    showTaskNameInTray: booleanValue(
      value.showTaskNameInTray,
      defaultSettings.showTaskNameInTray,
    ),
    menuBarLabelStyle: enumValue(
      value.menuBarLabelStyle,
      ["timer", "project", "activity", "hidden"] as const,
      defaultSettings.menuBarLabelStyle,
    ),
    showSecondsInTimer: booleanValue(
      value.showSecondsInTimer,
      defaultSettings.showSecondsInTimer,
    ),
    trayIconSize: enumValue(
      value.trayIconSize,
      ["small", "medium", "large", "xlarge"] as const,
      defaultSettings.trayIconSize,
    ),
    trayIconShape: enumValue(
      value.trayIconShape,
      ["dot", "ring", "square", "clock"] as const,
      defaultSettings.trayIconShape,
    ),
    trayColors: normalizeTrayColors(value.trayColors),
    enableIdleDetection: booleanValue(
      value.enableIdleDetection,
      defaultSettings.enableIdleDetection,
    ),
    idleThresholdMinutes: integerValue(
      value.idleThresholdMinutes,
      defaultSettings.idleThresholdMinutes,
      1,
      60,
    ),
    idleAction: enumValue(
      value.idleAction,
      ["ask", "stop", "discard", "continue"] as const,
      defaultSettings.idleAction,
    ),
    showIdleNotification: booleanValue(
      value.showIdleNotification,
      defaultSettings.showIdleNotification,
    ),
    theme: enumValue(
      value.theme,
      ["light", "dark", "transparent"] as const,
      defaultSettings.theme,
    ),
    uiSize: enumValue(
      value.uiSize,
      ["small", "default", "large"] as const,
      defaultSettings.uiSize,
    ),
    roundedPopupCorners: booleanValue(
      value.roundedPopupCorners,
      defaultSettings.roundedPopupCorners,
    ),
    reduceVisualEffects: booleanValue(
      value.reduceVisualEffects,
      defaultSettings.reduceVisualEffects,
    ),
    accentStyle: enumValue(
      value.accentStyle,
      ["blue", "green", "purple", "orange", "red"] as const,
      defaultSettings.accentStyle,
    ),
    popupLayout: enumValue(
      value.popupLayout,
      ["classic", "focus", "taskbar", "timeline"] as const,
      defaultSettings.popupLayout,
    ),
    colorMode: enumValue(
      value.colorMode,
      [
        "kimai",
        "activity",
        "project",
        "customer",
        "activity-project",
        "activity-customer",
        "project-customer",
      ] as const,
      defaultSettings.colorMode,
    ),
    features: normalizeFeatures(value.features),
    shortcutTogglePopup: stringValue(value.shortcutTogglePopup, "", 256),
    shortcutStartStopTimer: stringValue(value.shortcutStartStopTimer, "", 256),
    shortcutOpenSettings: stringValue(value.shortcutOpenSettings, "", 256),
    trayLeftClickAction: enumValue(
      value.trayLeftClickAction,
      ["popup", "nothing"] as const,
      defaultSettings.trayLeftClickAction,
    ),
    trayRightClickAction: enumValue(
      value.trayRightClickAction,
      ["menu", "popup"] as const,
      defaultSettings.trayRightClickAction,
    ),
    displayMode: enumValue(
      value.displayMode,
      ["tray", "detached"] as const,
      defaultSettings.displayMode,
    ),
    trueTrayMode: booleanValue(value.trueTrayMode, defaultSettings.trueTrayMode),
    popupMonitorMode: enumValue(
      value.popupMonitorMode,
      ["active", "specific"] as const,
      defaultSettings.popupMonitorMode,
    ),
    popupMonitorIndex: integerValue(
      value.popupMonitorIndex,
      defaultSettings.popupMonitorIndex,
      0,
      255,
    ),
    popupMonitorPosition: enumValue(
      value.popupMonitorPosition,
      ["bottom-right", "bottom-left", "top-right", "top-left", "center"] as const,
      defaultSettings.popupMonitorPosition,
    ),
    autoUpdate: booleanValue(value.autoUpdate, defaultSettings.autoUpdate),
    issueIntegrations: normalizeIssueIntegrations(value.issueIntegrations),
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
      settings.uiSize = rawObj.useCompactPopup === true ? "small" : "default";
      await persistMigratedSettings(store, settings);
    }

    if (settings.kimaiUrl && (!settings.connections || settings.connections.length === 0)) {
      const id = crypto.randomUUID();
      let name = "Kimai";
      try { name = new URL(settings.kimaiUrl).hostname; } catch { /* keep default */ }
      settings.connections = [{ id, name, url: settings.kimaiUrl }];
      settings.activeConnectionId = id;
      await persistMigratedSettings(store, settings);
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
        featureNote: booleanValue(
          rawObj.featureNote,
          defaultFeatureSettings.featureNote,
        ),
        featureTags: booleanValue(
          rawObj.featureTags,
          defaultFeatureSettings.featureTags,
        ),
        featurePausedTimerDescriptionHover:
          booleanValue(
            rawObj.featurePausedTimerDescriptionHover,
            defaultFeatureSettings.featurePausedTimerDescriptionHover,
          ),
        featureCustomerSelect: booleanValue(
          rawObj.featureCustomerSelect,
          defaultFeatureSettings.featureCustomerSelect,
        ),
        featureCustomStartTime: booleanValue(
          rawObj.featureCustomStartTime,
          defaultFeatureSettings.featureCustomStartTime,
        ),
        featureCategoryMode: defaultFeatureSettings.featureCategoryMode,
      };
      for (const conn of settings.connections ?? []) {
        settings.features[conn.id] = { ...migrated };
      }
      await persistMigratedSettings(store, settings);
    }

    // Migrate the per-connection toggle from the old "CS Mode" name.
    let migratedCategoryMode = false;
    const rawFeatures = isRecord(rawObj.features) ? rawObj.features : {};
    for (const [id, feat] of Object.entries(settings.features)) {
      const rawFeature = isRecord(rawFeatures[id]) ? rawFeatures[id] : {};
      const legacy = rawFeature.featureCsMode;
      if (
        typeof legacy === "boolean" &&
        rawFeature.featureCategoryMode === undefined
      ) {
        settings.features[id] = { ...feat, featureCategoryMode: legacy };
        migratedCategoryMode = true;
      }
    }
    if (migratedCategoryMode) {
      await persistMigratedSettings(store, settings);
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
