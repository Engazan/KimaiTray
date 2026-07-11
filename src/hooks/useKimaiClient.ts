import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { createKimaiClient, type KimaiClient } from "../api/kimaiClient";
import { getConnectionToken } from "../api/connectionTokenStore";
import { loadSettings, onSettingsChange, saveSettings, defaultFeatureSettings } from "../settings/service";
import type { SavedConnection, ColorMode } from "../types";
import type { IssueIntegrationSettings } from "../integrations/issues/types";
import { getIssueToken } from "../integrations/issues/issueTokenStore";
import { LatestRequest } from "../utils/latestRequest";

interface IdleSettings {
  enableIdleDetection: boolean;
  idleThresholdMinutes: number;
  idleAction: "ask" | "stop" | "discard" | "continue";
  showIdleNotification: boolean;
}

interface TraySettings {
  showElapsedInTray: boolean;
  showTaskNameInTray: boolean;
  menuBarLabelStyle: "timer" | "project" | "activity" | "hidden";
  showSecondsInTimer: boolean;
}

interface ShortcutSettings {
  shortcutTogglePopup: string;
  shortcutStartStopTimer: string;
  shortcutOpenSettings: string;
}

type PopupLayout = "classic" | "focus" | "taskbar" | "timeline";

interface FeatureFlags {
  featureNote: boolean;
  featureTags: boolean;
  featurePausedTimerDescriptionHover: boolean;
  featureCustomerSelect: boolean;
  featureCustomStartTime: boolean;
  featureCategoryMode: boolean;
}

interface UseKimaiClientResult {
  client: KimaiClient | null;
  isConfigured: boolean;
  refreshInterval: number;
  baseUrl: string;
  openKimaiInBrowser: boolean;
  idleSettings: IdleSettings;
  traySettings: TraySettings;
  shortcutSettings: ShortcutSettings;
  featureFlags: FeatureFlags;
  autoUpdate: boolean;
  popupLayout: PopupLayout;
  colorMode: ColorMode;
  displayMode: "tray" | "detached";
  connections: SavedConnection[];
  activeConnectionId: string;
  switchConnection: (id: string) => void;
  issueIntegration: IssueIntegrationSettings;
  issueToken: string | null;
}

const defaultIdleSettings: IdleSettings = {
  enableIdleDetection: false,
  idleThresholdMinutes: 5,
  idleAction: "ask",
  showIdleNotification: true,
};

const defaultTraySettings: TraySettings = {
  showElapsedInTray: true,
  showTaskNameInTray: false,
  menuBarLabelStyle: "timer",
  showSecondsInTimer: true,
};

const defaultShortcutSettings: ShortcutSettings = {
  shortcutTogglePopup: "",
  shortcutStartStopTimer: "",
  shortcutOpenSettings: "",
};

export function useKimaiClient(): UseKimaiClientResult {
  const [baseUrl, setBaseUrl] = useState("");
  const [token, setToken] = useState("");
  const [refreshInterval, setRefreshInterval] = useState(60);
  const [openKimaiInBrowser, setOpenKimaiInBrowser] = useState(true);
  const [ready, setReady] = useState(false);
  const [connections, setConnections] = useState<SavedConnection[]>([]);
  const [activeConnectionId, setActiveConnectionId] = useState("");
  const [idleSettings, setIdleSettings] =
    useState<IdleSettings>(defaultIdleSettings);
  const [traySettings, setTraySettings] =
    useState<TraySettings>(defaultTraySettings);
  const [autoUpdate, setAutoUpdate] = useState(true);
  const [popupLayout, setPopupLayout] = useState<PopupLayout>("classic");
  const [colorMode, setColorMode] = useState<ColorMode>("kimai");
  const [displayMode, setDisplayMode] = useState<"tray" | "detached">("tray");
  const [featureFlags, setFeatureFlags] = useState<FeatureFlags>({
    featureNote: true,
    featureTags: false,
    featurePausedTimerDescriptionHover: false,
    featureCustomerSelect: true,
    featureCustomStartTime: true,
    featureCategoryMode: false,
  });
  const [shortcutSettings, setShortcutSettings] =
    useState<ShortcutSettings>(defaultShortcutSettings);
  const [issueIntegration, setIssueIntegration] =
    useState<IssueIntegrationSettings>({
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
    });
  const [issueToken, setIssueToken] = useState<string | null>(null);

  const baseUrlRef = useRef("");
  const activeIdRef = useRef("");
  const settingsRequestsRef = useRef(new LatestRequest());

  const applySettings = useCallback(async (s: Awaited<ReturnType<typeof loadSettings>>) => {
    const generation = settingsRequestsRef.current.begin();
    const nextConnId = s.activeConnectionId ?? "";
    const urlChanged = s.kimaiUrl !== baseUrlRef.current;
    const connChanged = nextConnId !== activeIdRef.current;
    baseUrlRef.current = s.kimaiUrl;
    activeIdRef.current = nextConnId;

    // Clear the token when switching connection (even to the same server URL)
    // so the client turns null until the new connection's token loads — this
    // avoids a fetch with the previous connection's token under the new key.
    if (urlChanged || connChanged) {
      setToken("");
    }
    setBaseUrl(s.kimaiUrl);
    setConnections(s.connections ?? []);
    setActiveConnectionId(s.activeConnectionId ?? "");
    setRefreshInterval(s.refreshInterval);
    setOpenKimaiInBrowser(s.openKimaiInBrowser);
    setIdleSettings({
      enableIdleDetection: s.enableIdleDetection,
      idleThresholdMinutes: s.idleThresholdMinutes,
      idleAction: s.idleAction,
      showIdleNotification: s.showIdleNotification,
    });
    setTraySettings({
      showElapsedInTray: s.showElapsedInTray,
      showTaskNameInTray: s.showTaskNameInTray,
      menuBarLabelStyle: s.menuBarLabelStyle,
      showSecondsInTimer: s.showSecondsInTimer,
    });
    setShortcutSettings({
      shortcutTogglePopup: s.shortcutTogglePopup,
      shortcutStartStopTimer: s.shortcutStartStopTimer,
      shortcutOpenSettings: s.shortcutOpenSettings,
    });
    setAutoUpdate(s.autoUpdate);
    setPopupLayout(s.popupLayout ?? "classic");
    setColorMode(s.colorMode ?? "kimai");
    setDisplayMode(s.displayMode ?? "tray");
    const connId = nextConnId;
    setFeatureFlags({
      ...defaultFeatureSettings,
      ...((s.features ?? {})[connId] ?? {}),
    });
    const issueConfig = (s.issueIntegrations ?? {})[connId] ?? {
      enabled: false,
      provider: "gitlab" as const,
      baseUrl: "",
      apiBaseUrl: "",
      projectPathOrRepo: "",
      defaultState: "opened" as const,
      assigneeOnly: false,
    };
    setIssueIntegration(issueConfig);
    if (issueConfig.enabled && connId) {
      try {
        const it = await getIssueToken(connId);
        if (!settingsRequestsRef.current.isCurrent(generation)) return;
        setIssueToken(it);
      } catch {
        if (!settingsRequestsRef.current.isCurrent(generation)) return;
        setIssueToken(null);
      }
    } else {
      setIssueToken(null);
    }
    if (s.kimaiUrl || connId) {
      try {
        const t = await getConnectionToken(connId, s.kimaiUrl);
        if (!settingsRequestsRef.current.isCurrent(generation)) return;
        setToken(t ?? "");
      } catch {
        if (!settingsRequestsRef.current.isCurrent(generation)) return;
        setToken("");
      }
    } else {
      setToken("");
    }
    setReady(true);
  }, []);

  const load = useCallback(async () => {
    const s = await loadSettings();
    await applySettings(s);
  }, [applySettings]);

  useEffect(() => {
    load();
  }, [load]);

  // React to cross-window store changes immediately
  useEffect(() => {
    const cleanup = onSettingsChange((s) => { applySettings(s); });
    return () => { cleanup.then((fn) => fn()); };
  }, [applySettings]);

  // Also reload on focus/show as fallback
  useEffect(() => {
    const win = getCurrentWindow();
    const unlistenFocus = win.onFocusChanged(({ payload }) => {
      if (payload) load();
    });
    const unlistenShow = win.listen("tauri://window-show", () => {
      load();
    });
    return () => {
      unlistenFocus.then((fn) => fn());
      unlistenShow.then((fn) => fn());
    };
  }, [load]);

  const switchConnection = useCallback(async (id: string) => {
    const generation = settingsRequestsRef.current.begin();
    const s = await loadSettings();
    if (!settingsRequestsRef.current.isCurrent(generation)) return;
    const conn = s.connections.find((c) => c.id === id);
    if (!conn) return;

    let t = "";
    try {
      t = (await getConnectionToken(conn.id, conn.url)) ?? "";
    } catch { /* token load failed */ }
    if (!settingsRequestsRef.current.isCurrent(generation)) return;

    baseUrlRef.current = conn.url;
    setBaseUrl(conn.url);
    setToken(t);
    setActiveConnectionId(id);

    await saveSettings({ ...s, activeConnectionId: id, kimaiUrl: conn.url });
  }, []);

  const client = useMemo(() => {
    if (!baseUrl || !token) return null;
    return createKimaiClient(baseUrl, token, activeConnectionId);
  }, [baseUrl, token, activeConnectionId]);

  return {
    client,
    isConfigured: ready && !!baseUrl && !!token,
    refreshInterval,
    baseUrl,
    openKimaiInBrowser,
    idleSettings,
    traySettings,
    shortcutSettings,
    featureFlags,
    autoUpdate,
    popupLayout,
    colorMode,
    displayMode,
    connections,
    activeConnectionId,
    switchConnection,
    issueIntegration,
    issueToken,
  };
}
