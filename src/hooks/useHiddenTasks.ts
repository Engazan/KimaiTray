import { useState, useEffect, useCallback } from "react";
import {
  loadHiddenTasks,
  addHiddenTask,
  removeHiddenTask,
  clearHiddenTasks,
} from "../api/hiddenTasksStore";

export function useHiddenTasks(connectionId: string) {
  const [hiddenKeys, setHiddenKeys] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!connectionId) {
      setHiddenKeys(new Set());
      return;
    }
    let cancelled = false;
    loadHiddenTasks(connectionId).then((keys) => {
      if (!cancelled) setHiddenKeys(new Set(keys));
    });
    return () => { cancelled = true; };
  }, [connectionId]);

  const hideTask = useCallback(async (key: string) => {
    if (!connectionId) return;
    const updated = await addHiddenTask(connectionId, key);
    setHiddenKeys(new Set(updated));
  }, [connectionId]);

  const unhideTask = useCallback(async (key: string) => {
    if (!connectionId) return;
    const updated = await removeHiddenTask(connectionId, key);
    setHiddenKeys(new Set(updated));
  }, [connectionId]);

  const clearAll = useCallback(async () => {
    if (!connectionId) return;
    await clearHiddenTasks(connectionId);
    setHiddenKeys(new Set());
  }, [connectionId]);

  return { hiddenKeys, hideTask, unhideTask, clearAll };
}
