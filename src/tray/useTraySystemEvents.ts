import { useEffect, useRef } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { registerShortcuts } from "../api/trayApi";
import type { AppSettings } from "../types";

type ShortcutSettings = Pick<AppSettings,
  "shortcutTogglePopup" | "shortcutStartStopTimer" | "shortcutNewTask" |
  "shortcutPauseResume" | "shortcutContinueLastTask" | "shortcutEditNote" |
  "shortcutOpenKimai" | "shortcutOpenSettings">;
interface Options {
  shortcutSettings: ShortcutSettings;
  stopTimerOnScreensaver: boolean;
  stopTimerOnScreenLock: boolean;
  stopTimer: () => void;
  pauseResume: () => void;
  continueLastTask: () => void;
  editNote: () => void;
  newTask: () => void;
  refresh: () => void;
}
export function useTraySystemEvents(options: Options) {
  const latest = useRef(options);
  latest.current = options;
  const { shortcutSettings } = options;

  useEffect(() => {
    const win = getCurrentWindow();
    const listeners = [
      win.listen("kimai://refresh", () => latest.current.refresh()),
      win.listen("kimai://new-task", () => latest.current.newTask()),
      win.listen("kimai://toggle-timer", () => latest.current.stopTimer()),
      win.listen("kimai://pause-resume-timer", () => latest.current.pauseResume()),
      win.listen("kimai://continue-last-task", () => latest.current.continueLastTask()),
      win.listen("kimai://edit-active-note", () => latest.current.editNote()),
      win.listen("kimai://screensaver-started", () => {
        if (latest.current.stopTimerOnScreensaver) latest.current.stopTimer();
      }),
      win.listen("kimai://screen-locked", () => {
        if (latest.current.stopTimerOnScreenLock) latest.current.stopTimer();
      }),
    ];
    return () => {
      for (const listener of listeners) {
        void listener.then((unlisten) => unlisten());
      }
    };
  }, []);

  // Re-register global shortcuts when settings change
  useEffect(() => {
    registerShortcuts({
      togglePopup: shortcutSettings.shortcutTogglePopup,
      startStopTimer: shortcutSettings.shortcutStartStopTimer,
      newTask: shortcutSettings.shortcutNewTask,
      pauseResume: shortcutSettings.shortcutPauseResume,
      continueLastTask: shortcutSettings.shortcutContinueLastTask,
      editNote: shortcutSettings.shortcutEditNote,
      openKimai: shortcutSettings.shortcutOpenKimai,
      openSettings: shortcutSettings.shortcutOpenSettings,
    }).catch(() => { });
  }, [
    shortcutSettings.shortcutTogglePopup,
    shortcutSettings.shortcutStartStopTimer,
    shortcutSettings.shortcutNewTask,
    shortcutSettings.shortcutPauseResume,
    shortcutSettings.shortcutContinueLastTask,
    shortcutSettings.shortcutEditNote,
    shortcutSettings.shortcutOpenKimai,
    shortcutSettings.shortcutOpenSettings,
  ]);
}
