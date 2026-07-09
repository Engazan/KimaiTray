import { useCallback, useEffect, useRef, useState } from "react";
import type { CategoryConfig } from "./types";
import { cloneDefaultCategoryConfig } from "./defaultCategoryConfig";
import { loadCategoryConfig, saveCategoryConfig, onCategoryConfigChange } from "./categoryConfigStore";

/**
 * Loads and persists the Category Mode config for the given connection, and keeps it
 * in sync across windows (popup ↔ settings) via the store's key-change events.
 */
export function useCategoryConfig(connectionId: string) {
  const [config, setConfig] = useState<CategoryConfig>(() => cloneDefaultCategoryConfig());
  const [loaded, setLoaded] = useState(false);
  // Number of our own saves whose store echo hasn't arrived yet. Each save fires
  // one onKeyChange in this same window; skipping those prevents a late echo of
  // an earlier value from reverting in-progress edits (e.g. while typing).
  const pendingSelfWrites = useRef(0);

  useEffect(() => {
    let cancelled = false;
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
      if (pendingSelfWrites.current > 0) {
        pendingSelfWrites.current -= 1;
        return;
      }
      setConfig(next);
    });
    return () => {
      cleanup.then((fn) => fn());
    };
  }, [connectionId]);

  const updateConfig = useCallback(
    async (next: CategoryConfig) => {
      setConfig(next);
      pendingSelfWrites.current += 1;
      await saveCategoryConfig(connectionId, next);
    },
    [connectionId],
  );

  return { config, loaded, updateConfig };
}
