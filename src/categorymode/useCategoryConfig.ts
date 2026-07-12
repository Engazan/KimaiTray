import { useCallback, useEffect, useRef, useState } from "react";
import type { CategoryConfig } from "./types";
import { cloneDefaultCategoryConfig } from "./defaultCategoryConfig";
import { loadCategoryConfig, saveCategoryConfig, onCategoryConfigChange } from "./categoryConfigStore";
import { PendingWriteEchoes } from "../utils/pendingWriteEchoes";

/**
 * Loads and persists the Category Mode config for the given connection, and keeps it
 * in sync across windows (popup ↔ settings) via the store's key-change events.
 */
export function useCategoryConfig(connectionId: string) {
  const [config, setConfig] = useState<CategoryConfig>(() => cloneDefaultCategoryConfig());
  const [loaded, setLoaded] = useState(false);
  const pendingSelfWrites = useRef(new PendingWriteEchoes<CategoryConfig>());

  useEffect(() => {
    let cancelled = false;
    pendingSelfWrites.current.clear();
    setLoaded(false);
    loadCategoryConfig(connectionId).then((c) => {
      if (!cancelled) {
        setConfig(c);
        setLoaded(true);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [connectionId]);

  // React to edits made in the other window, ignoring echoes of our own saves.
  useEffect(() => {
    if (!connectionId) return;
    const cleanup = onCategoryConfigChange(connectionId, (next) => {
      if (pendingSelfWrites.current.consume(next)) return;
      setConfig(next);
    });
    return () => {
      cleanup.then((fn) => fn());
    };
  }, [connectionId]);

  const updateConfig = useCallback(
    async (next: CategoryConfig) => {
      setConfig(next);
      pendingSelfWrites.current.remember(next);
      try {
        await saveCategoryConfig(connectionId, next);
      } catch (error) {
        pendingSelfWrites.current.discard(next);
        throw error;
      }
    },
    [connectionId],
  );

  return { config, loaded, updateConfig };
}
