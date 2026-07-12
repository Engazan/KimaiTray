import { useCallback, useEffect, useRef, useState } from "react";
import type { AppSettings, SavedConnection } from "../types";
import { defaultSettings, loadSettings, patchSettings } from "./service";
import {
  deleteConnectionToken,
  getConnectionToken,
  saveConnectionToken,
} from "../api/connectionTokenStore";
import { LatestRequest } from "../utils/latestRequest";
import { deleteIssueToken } from "../integrations/issues/issueTokenStore";

export function useSettings() {
  const [settings, setSettings] = useState<AppSettings>(defaultSettings);
  const [token, setToken] = useState("");
  const [loaded, setLoaded] = useState(false);
  // Id of the connection whose token is currently loaded into `token`.
  const activeIdRef = useRef("");
  const settingsRef = useRef(settings);
  const tokenLoadRequestsRef = useRef(new LatestRequest());
  settingsRef.current = settings;

  useEffect(() => {
    loadSettings().then((s) => {
      setSettings(s);
      activeIdRef.current = s.activeConnectionId ?? "";
      loadToken(s.activeConnectionId ?? "", s.kimaiUrl);
    });
  }, []);

  async function loadToken(connectionId: string, legacyUrl: string) {
    const generation = tokenLoadRequestsRef.current.begin();
    try {
      const t = await getConnectionToken(connectionId, legacyUrl);
      if (
        activeIdRef.current !== connectionId ||
        !tokenLoadRequestsRef.current.isCurrent(generation)
      ) return;
      setToken(t ?? "");
    } catch {
      if (
        activeIdRef.current !== connectionId ||
        !tokenLoadRequestsRef.current.isCurrent(generation)
      ) return;
      setToken("");
    } finally {
      if (
        activeIdRef.current === connectionId &&
        tokenLoadRequestsRef.current.isCurrent(generation)
      ) setLoaded(true);
    }
  }

  const update = useCallback(
    <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => {
      setSettings((prev) => ({ ...prev, [key]: value }));
      void patchSettings({ [key]: value }).catch(() => {
        // Keep the in-memory setting responsive; explicit connection
        // transactions surface persistence failures to their forms.
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
      try {
        await patchSettings({
          connections,
          activeConnectionId: conn.id,
          kimaiUrl: conn.url,
        });

        // Tokens are keyed by connection id, so editing a connection's URL no
        // longer needs to move the token between URL keys.
        if (newToken) {
          await saveConnectionToken(conn.id, newToken);
        } else {
          await deleteConnectionToken(conn.id);
        }
      } catch (error) {
        // Do not leave a connection selected when its credential could not be
        // persisted securely. Restore the previous settings best-effort and
        // surface the original failure to the form.
        setSettings(prev);
        await patchSettings(
          {
            connections: prev.connections,
            activeConnectionId: prev.activeConnectionId,
            kimaiUrl: prev.kimaiUrl,
          },
          {
            connections,
            activeConnectionId: conn.id,
            kimaiUrl: conn.url,
          },
        ).catch(() => {});
        throw error;
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
    await patchSettings({
      connections: remaining,
      activeConnectionId: next.activeConnectionId,
      kimaiUrl: next.kimaiUrl,
    });

    const credentialResults = await Promise.allSettled([
      deleteConnectionToken(id),
      deleteIssueToken(id),
    ]);
    const credentialFailure = credentialResults.find(
      (result): result is PromiseRejectedResult => result.status === "rejected",
    );
    if (credentialFailure) {
      setSettings(prev);
      await patchSettings(
        {
          connections: prev.connections,
          activeConnectionId: prev.activeConnectionId,
          kimaiUrl: prev.kimaiUrl,
        },
        {
          connections: remaining,
          activeConnectionId: next.activeConnectionId,
          kimaiUrl: next.kimaiUrl,
        },
      ).catch(() => {});
      throw credentialFailure.reason;
    }

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
    await patchSettings({ activeConnectionId: id, kimaiUrl: conn.url });

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
