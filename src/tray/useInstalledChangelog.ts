import { useEffect } from "react";
import { getVersion } from "@tauri-apps/api/app";
import { claimInstalledChangelog, rememberPendingChangelog } from "../api/changelog";
import { showChangelogWindow } from "../api/changelogWindow";
import { logger } from "../utils/logger";

export function useInstalledChangelog() {
  useEffect(() => {
    let cancelled = false;
    void getVersion()
      .then(async (version) => {
        if (cancelled) return;
        const changelog = claimInstalledChangelog(version);
        if (!changelog) return;
        try {
          const opened = await showChangelogWindow(changelog);
          if (!opened) rememberPendingChangelog(changelog);
        } catch (error) {
          rememberPendingChangelog(changelog);
          throw error;
        }
      })
      .catch((error) => {
        logger.error(`Failed to open installed changelog: ${String(error)}`);
      });
    return () => {
      cancelled = true;
    };
  }, []);
}
