import { useEffect } from "react";
import { loadCategoryConfig, saveCategoryConfig } from "./categoryConfigStore";
import { fetchRemoteCategoryConfig } from "./categoryRemoteSource";

const SYNC_INTERVAL_MS = 60 * 60 * 1000; // hourly

/**
 * When the connection's config has a `sourceUrl`, fetch the category tree from
 * it on mount and every hour, writing the result to the store (which propagates
 * to the panel and the settings editor via the store's key-change events).
 *
 * The local `defaultProjectId` and `sourceUrl` are preserved — only the
 * categories (portable, name-based) and optionally `continueWindowMinutes` come
 * from the remote. Failures are ignored so the last-known config stays.
 * Mounted once, in the tray popup, to avoid duplicate fetches across windows.
 */
export function useCategoryRemoteSync(
  connectionId: string,
  sourceUrl: string | undefined,
) {
  useEffect(() => {
    const url = sourceUrl?.trim();
    if (!connectionId || !url || !/^https?:\/\//i.test(url)) return;
    let cancelled = false;

    const sync = async () => {
      const remote = await fetchRemoteCategoryConfig(url, connectionId);
      if (cancelled || !remote) return;
      const cfg = await loadCategoryConfig(connectionId);
      // Only apply while this URL is still the configured source.
      if (cfg.sourceUrl?.trim() !== url) return;
      await saveCategoryConfig(connectionId, {
        ...cfg,
        categories: remote.categories,
        continueWindowMinutes:
          remote.continueWindowMinutes ?? cfg.continueWindowMinutes,
        sourceSyncedAt: Math.floor(Date.now() / 1000),
      });
    };

    sync();
    const id = setInterval(sync, SYNC_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [connectionId, sourceUrl]);
}
