import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import type { ActiveTimer, AppSettings } from "../types";
import type { PausedTimerData } from "../api/pauseStore";
import type { ConnectionStatus } from "../hooks/useActiveTimer";
import { formatAcceleratorForDisplay } from "../settings/Controls";
import {
  setTrayIcon,
  setTrayTitle,
  setTrayTooltip,
  startTrayTicker,
  stopTrayTicker,
  updateTrayMenu,
} from "../api/trayApi";

interface Options {
  timer: ActiveTimer | null;
  status: ConnectionStatus;
  hasPausedTimers: boolean;
  pausedTimers: PausedTimerData[];
  traySettings: Pick<AppSettings, "menuBarLabelStyle" | "showSecondsInTimer">;
  shortcutSettings: Pick<AppSettings, "shortcutTogglePopup">;
}
export function useTrayPresentation({
  timer,
  status,
  hasPausedTimers,
  pausedTimers,
  traySettings,
  shortcutSettings,
}: Options) {
  const { t, i18n } = useTranslation();
  useEffect(() => {
    const shortcutHint = shortcutSettings.shortcutTogglePopup
      ? `  ${formatAcceleratorForDisplay(shortcutSettings.shortcutTogglePopup)}`
      : "";
    updateTrayMenu({
      toggleLabel: t("common.showHide") + shortcutHint,
      settingsLabel: t("common.settings"),
      openKimaiLabel: t("common.openKimai"),
      refreshLabel: t("common.refresh"),
      quitLabel: t("common.quit"),
    });
  }, [i18n.language, t, shortcutSettings.shortcutTogglePopup]);
  const hasTimer = !!timer;
  useEffect(() => {
    if (status === "error" || status === "offline") {
      setTrayIcon("error");
    } else if (timer) {
      setTrayIcon("running");
    } else if (hasPausedTimers) {
      setTrayIcon("paused");
    } else {
      setTrayIcon("idle");
    }
  }, [status, hasTimer, hasPausedTimers, timer]);

  // Update tray tooltip and menu bar title.
  // The per-second tick runs in a native Rust thread (start/stopTrayTicker)
  // so macOS cannot throttle it like it does with webview JS timers.
  useEffect(() => {
    if (!timer && hasPausedTimers) {
      stopTrayTicker();
      const first = pausedTimers[0];
      const suffix = pausedTimers.length > 1 ? ` (+${pausedTimers.length - 1})` : "";
      setTrayTooltip(`KimaiTray — ${t("pause.paused")} — ${first.project}${suffix}`);
      if (traySettings.menuBarLabelStyle !== "hidden") {
        setTrayTitle(t("pause.paused"));
      } else {
        setTrayTitle("");
      }
      return;
    }

    if (!timer) {
      stopTrayTicker();
      return;
    }

    startTrayTicker(
      timer.beginSeconds,
      timer.project,
      timer.activity,
      traySettings.menuBarLabelStyle,
      traySettings.showSecondsInTimer,
    );

    return () => {
      stopTrayTicker();
    };
  }, [timer, hasPausedTimers, pausedTimers, traySettings, t]);
}
