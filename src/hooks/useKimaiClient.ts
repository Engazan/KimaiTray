import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { createKimaiClient, type KimaiClient } from "../api/kimaiClient";
import { getApiToken } from "../api/secureStore";
import { loadSettings, onSettingsChange, saveSettings } from "../settings/service";
import type { SavedConnection } from "../types";

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
  featureCustomerSelect: boolean;
  featureCustomStartTime: boolean;
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
  connections: SavedConnection[];
  activeConnectionId: string;
  switchConnection: (id: string) => void;
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
  const [featureFlags, setFeatureFlags] = useState<FeatureFlags>({
    featureNote: true,
    featureTags: false,
    featureCustomerSelect: true,
    featureCustomStartTime: true,
  });
  const [shortcutSettings, setShortcutSettings] =
    useState<ShortcutSettings>(defaultShortcutSettings);

  const baseUrlRef = useRef("");

  const applySettings = useCallback(async (s: Awaited<ReturnType<typeof loadSettings>>) => {
    const urlChanged = s.kimaiUrl !== baseUrlRef.current;
    baseUrlRef.current = s.kimaiUrl;

    if (urlChanged) {
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
    setFeatureFlags({
      featureNote: s.featureNote ?? true,
      featureTags: s.featureTags ?? false,
      featureCustomerSelect: s.featureCustomerSelect ?? true,
      featureCustomStartTime: s.featureCustomStartTime ?? true,
    });
    if (s.kimaiUrl) {
      try {
        const t = await getApiToken(s.kimaiUrl);
        setToken(t ?? "");
      } catch {
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
    const s = await loadSettings();
    const conn = s.connections.find((c) => c.id === id);
    if (!conn) return;

    let t = "";
    try {
      t = (await getApiToken(conn.url)) ?? "";
    } catch { /* token load failed */ }

    baseUrlRef.current = conn.url;
    setBaseUrl(conn.url);
    setToken(t);
    setActiveConnectionId(id);

    await saveSettings({ ...s, activeConnectionId: id, kimaiUrl: conn.url });
  }, []);

  const client = useMemo(() => {
    if (!baseUrl || !token) return null;
    return createKimaiClient(baseUrl, token);
  }, [baseUrl, token]);

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
    connections,
    activeConnectionId,
    switchConnection,
  };
}
