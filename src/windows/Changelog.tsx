import { useCallback, useEffect, useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import type { AppSettings } from "../types";
import ChangelogDialog from "../components/ChangelogDialog";
import {
  forgetQueuedChangelogWindow,
  readQueuedChangelogWindow,
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
  const [content, setContent] = useState<ChangelogEntry | null>(
    readQueuedChangelogWindow,
  );
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
    let cancelled = false;
    const unlisten = getCurrentWindow()
      .listen<ChangelogEntry>(CHANGELOG_SHOW_EVENT, (event) => {
        setContent(event.payload);
      })
      .then((cleanup) => {
        if (cancelled) {
          cleanup();
          return () => {};
        }
        const queued = readQueuedChangelogWindow();
        if (queued) setContent(queued);
        return cleanup;
      });
    return () => {
      cancelled = true;
      unlisten.then((cleanup) => cleanup());
    };
  }, []);

  useEffect(() => {
    const win = getCurrentWindow();
    if (!content) {
      void win.hide().catch((error) => {
        logger.error(`Failed to hide empty changelog: ${String(error)}`);
      });
      return;
    }

    const frame = window.requestAnimationFrame(() => {
      void (async () => {
        await win.show();
        await win.setFocus();
        forgetQueuedChangelogWindow(content);
      })().catch((error) => {
        logger.error(`Failed to show changelog: ${String(error)}`);
      });
    });

    return () => {
      window.cancelAnimationFrame(frame);
    };
  }, [content]);

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
