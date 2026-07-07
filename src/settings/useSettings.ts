import { useCallback, useEffect, useRef, useState } from "react";
import type { AppSettings, SavedConnection } from "../types";
import { defaultSettings, loadSettings, saveSettings } from "./service";
import {
  deleteConnectionToken,
  getConnectionToken,
  saveConnectionToken,
} from "../api/connectionTokenStore";

export function useSettings() {
  const [settings, setSettings] = useState<AppSettings>(defaultSettings);
  const [token, setToken] = useState("");
  const [loaded, setLoaded] = useState(false);
  // Id of the connection whose token is currently loaded into `token`.
  const activeIdRef = useRef("");
  const settingsRef = useRef(settings);
  settingsRef.current = settings;

  useEffect(() => {
    loadSettings().then((s) => {
      setSettings(s);
      activeIdRef.current = s.activeConnectionId ?? "";
      loadToken(s.activeConnectionId ?? "", s.kimaiUrl);
    });
  }, []);

  async function loadToken(connectionId: string, legacyUrl: string) {
    try {
      const t = await getConnectionToken(connectionId, legacyUrl);
      setToken(t ?? "");
    } catch {
      setToken("");
    } finally {
      setLoaded(true);
    }
  }

  const update = useCallback(
    <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => {
      setSettings((prev) => {
        const next = { ...prev, [key]: value };
        saveSettings(next);
        return next;
      });
    },
    [],
  );

  const updateToken = useCallback(async (value: string) => {
    setToken(value);
    const id = activeIdRef.current;
    if (id) {
      try {
        if (value) {
          await saveConnectionToken(id, value);
        } else {
          await deleteConnectionToken(id);
        }
      } catch {
        // Store unavailable
      }
    }
  }, []);

  const saveConnection = useCallback(
    async (conn: SavedConnection, newToken: string) => {
      const prev = settingsRef.current;
      const idx = prev.connections.findIndex((c) => c.id === conn.id);
      const connections = [...prev.connections];
      if (idx >= 0) {
        connections[idx] = conn;
      } else {
        connections.push(conn);
      }

      const next = {
        ...prev,
        connections,
        activeConnectionId: conn.id,
        kimaiUrl: conn.url,
      };
      setSettings(next);
      saveSettings(next);

      // Tokens are keyed by connection id, so editing a connection's URL no
      // longer needs to move the token between URL keys.
      if (newToken) {
        await saveConnectionToken(conn.id, newToken);
      } else {
        await deleteConnectionToken(conn.id);
      }
      setToken(newToken);
      activeIdRef.current = conn.id;
    },
    [],
  );

  const removeConnection = useCallback(async (id: string) => {
    const prev = settingsRef.current;
    const wasActive = prev.activeConnectionId === id;
    const remaining = prev.connections.filter((c) => c.id !== id);
    const newActive = wasActive ? remaining[0] : null;

    const next = {
      ...prev,
      connections: remaining,
      activeConnectionId: wasActive
        ? (newActive?.id ?? "")
        : prev.activeConnectionId,
      kimaiUrl: wasActive ? (newActive?.url ?? "") : prev.kimaiUrl,
    };
    setSettings(next);
    saveSettings(next);

    await deleteConnectionToken(id);

    if (wasActive) {
      if (newActive) {
        activeIdRef.current = newActive.id;
        await loadToken(newActive.id, newActive.url);
      } else {
        setToken("");
        activeIdRef.current = "";
      }
    }
  }, []);

  const activateConnection = useCallback(async (id: string) => {
    const prev = settingsRef.current;
    const conn = prev.connections.find((c) => c.id === id);
    if (!conn || prev.activeConnectionId === id) return;

    const next = { ...prev, activeConnectionId: id, kimaiUrl: conn.url };
    setSettings(next);
    saveSettings(next);

    activeIdRef.current = id;
    await loadToken(id, conn.url);
  }, []);

  return {
    settings,
    token,
    update,
    updateToken,
    loaded,
    saveConnection,
    removeConnection,
    activateConnection,
  };
}
