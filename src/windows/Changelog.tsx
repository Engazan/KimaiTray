import { useCallback, useEffect, useState } from "react";
import { getVersion } from "@tauri-apps/api/app";
import { getCurrentWindow } from "@tauri-apps/api/window";
import type { AppSettings } from "../types";
import ChangelogDialog from "../components/ChangelogDialog";
import {
  claimInstalledChangelog,
  type ChangelogEntry,
} from "../api/changelog";
import { CHANGELOG_SHOW_EVENT } from "../api/changelogWindow";
import { defaultSettings, loadSettings, onSettingsChange } from "../settings/service";
import { useLanguageSync } from "../hooks/useLanguageSync";
import { logger } from "../utils/logger";

function applyAppearance(settings: AppSettings) {
  document.documentElement.dataset.accent = settings.accentStyle;
  document.documentElement.dataset.reduceMotion = String(
    settings.reduceVisualEffects,
  );
  const dark =
    settings.theme === "dark" ||
    (settings.theme === "transparent" &&
      window.matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.classList.toggle("dark", dark);
}

export default function Changelog() {
  const [content, setContent] = useState<ChangelogEntry | null>(null);
  useLanguageSync();

  const close = useCallback(() => {
    setContent(null);
    void getCurrentWindow().hide();
  }, []);

  useEffect(() => {
    const apply = (settings: AppSettings) => applyAppearance(settings);
    applyAppearance(defaultSettings);
    void loadSettings().then(apply);
    const cleanup = onSettingsChange(apply);
    return () => {
      cleanup.then((unlisten) => unlisten());
    };
  }, []);

  useEffect(() => {
    const unlisten = getCurrentWindow().listen<ChangelogEntry>(
      CHANGELOG_SHOW_EVENT,
      (event) => setContent(event.payload),
    );
    return () => {
      unlisten.then((cleanup) => cleanup());
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    void getVersion()
      .then(async (version) => {
        if (cancelled) return;
        const installedChangelog = claimInstalledChangelog(version);
        if (!installedChangelog) return;
        setContent(installedChangelog);
        const win = getCurrentWindow();
        await win.show();
        await win.setFocus();
      })
      .catch((error) => {
        logger.error(`Failed to show installed changelog: ${String(error)}`);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (!content) return null;

  return (
    <ChangelogDialog
      version={content.version}
      body={content.body}
      onClose={close}
      standalone
    />
  );
}
