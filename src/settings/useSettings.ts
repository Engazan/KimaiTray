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

const pendingCredentialCleanup = new Map<string, string | undefined>();
const credentialCleanupInFlight = new Set<string>();

async function cleanupConnectionCredentials(
  id: string,
  legacyUrl?: string,
): Promise<boolean> {
  const results = await Promise.allSettled([
    deleteConnectionToken(id, legacyUrl),
    deleteIssueToken(id),
  ]);
  const cleanupPending = results.some((result) => result.status === "rejected");
  if (cleanupPending) {
    pendingCredentialCleanup.set(id, legacyUrl);
  } else {
    pendingCredentialCleanup.delete(id);
  }
  return cleanupPending;
}

function retryPendingCredentialCleanup(): void {
  for (const [id, legacyUrl] of pendingCredentialCleanup) {
    if (credentialCleanupInFlight.has(id)) continue;
    credentialCleanupInFlight.add(id);
    void cleanupConnectionCredentials(id, legacyUrl).finally(() => {
      credentialCleanupInFlight.delete(id);
    });
  }
}

export function useSettings() {
  const [settings, setSettings] = useState<AppSettings>(defaultSettings);
  const [token, setToken] = useState("");
  const [loaded, setLoaded] = useState(false);
  // Id of the connection whose token is currently loaded into `token`.
  const activeIdRef = useRef("");
  const settingsRef = useRef(settings);
  const tokenRef = useRef(token);
  const tokenLoadRequestsRef = useRef(new LatestRequest());
  const tokenWriteRequestsRef = useRef(new LatestRequest());
  const activationRequestsRef = useRef(new LatestRequest());
  settingsRef.current = settings;
  tokenRef.current = token;

  useEffect(() => {
    retryPendingCredentialCleanup();
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
      tokenRef.current = t ?? "";
      setToken(tokenRef.current);
    } catch {
      if (
        activeIdRef.current !== connectionId ||
        !tokenLoadRequestsRef.current.isCurrent(generation)
      ) return;
      tokenRef.current = "";
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
      const previous = settingsRef.current[key];
      setSettings((prev) => ({ ...prev, [key]: value }));
      void patchSettings({ [key]: value }).catch(() => {
        setSettings((current) =>
          Object.is(current[key], value)
            ? { ...current, [key]: previous }
            : current,
        );
      });
    },
    [],
  );

  const updateToken = useCallback(async (value: string) => {
    const generation = tokenWriteRequestsRef.current.begin();
    const previous = tokenRef.current;
    tokenRef.current = value;
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
        if (
          tokenWriteRequestsRef.current.isCurrent(generation) &&
          activeIdRef.current === id
        ) {
          tokenRef.current = previous;
          setToken(previous);
        }
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
      tokenRef.current = newToken;
      setToken(newToken);
      activeIdRef.current = conn.id;
    },
    [],
  );

  const removeConnection = useCallback(async (id: string) => {
    const prev = settingsRef.current;
    const removed = prev.connections.find((connection) => connection.id === id);
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

    if (wasActive) {
      if (newActive) {
        activeIdRef.current = newActive.id;
        await loadToken(newActive.id, newActive.url);
      } else {
        tokenRef.current = "";
        setToken("");
        activeIdRef.current = "";
      }
    }

    const legacyUrl =
      removed && !remaining.some((connection) => connection.url === removed.url)
        ? removed.url
        : undefined;
    const credentialCleanupPending = await cleanupConnectionCredentials(
      id,
      legacyUrl,
    );
    return { credentialCleanupPending };
  }, []);

  const activateConnection = useCallback(async (id: string) => {
    const generation = activationRequestsRef.current.begin();
    const prev = settingsRef.current;
    const conn = prev.connections.find((c) => c.id === id);
    if (!conn || prev.activeConnectionId === id) return;

    const persisted = await patchSettings({
      activeConnectionId: id,
      kimaiUrl: conn.url,
    });
    if (!activationRequestsRef.current.isCurrent(generation)) return;

    setSettings(persisted);
    activeIdRef.current = id;
    tokenRef.current = "";
    setToken("");
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
