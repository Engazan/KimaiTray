import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { getCurrentWindow } from "@tauri-apps/api/window";
import type { AppSettings } from "../types";
import { defaultSettings, loadSettings, onSettingsChange } from "../settings/service";
import { useLanguageSync } from "../hooks/useLanguageSync";

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

export default function TimerReminder() {
  const { t } = useTranslation();
  const [thresholdMinutes, setThresholdMinutes] = useState(
    defaultSettings.noTimerReminderMinutes,
  );
  useLanguageSync();

  useEffect(() => {
    const apply = (settings: AppSettings) => {
      setThresholdMinutes(settings.noTimerReminderMinutes);
      applyAppearance(settings);
      if (!settings.enableNoTimerReminder) {
        void getCurrentWindow().hide();
      }
    };

    void loadSettings().then(apply);
    const cleanup = onSettingsChange(apply);
    return () => {
      cleanup.then((unlisten) => unlisten());
    };
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") void getCurrentWindow().hide();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, []);

  return (
    <main
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="timer-reminder-title"
      aria-describedby="timer-reminder-description"
      className="relative flex h-screen w-screen items-center justify-center overflow-hidden bg-slate-950/70 px-6 text-white"
    >
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_35%,rgba(59,130,246,0.28),transparent_48%)]" />
      <div className="relative flex max-w-3xl flex-col items-center text-center">
        <div className="mb-8 flex h-28 w-28 items-center justify-center rounded-full border border-white/15 bg-white/10 shadow-2xl shadow-blue-500/20">
          <svg
            className="h-14 w-14 text-blue-300"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={1.4}
            aria-hidden="true"
          >
            <circle cx="12" cy="12" r="8.25" />
            <path strokeLinecap="round" d="M12 7.75V12l2.75 1.75" />
            <path strokeLinecap="round" d="M8.5 3.9 6.9 2.3M15.5 3.9l1.6-1.6" />
          </svg>
        </div>

        <p className="mb-3 text-sm font-semibold uppercase tracking-[0.24em] text-blue-300">
          KimaiTray
        </p>
        <h1
          id="timer-reminder-title"
          className="text-balance text-4xl font-semibold tracking-tight sm:text-5xl"
        >
          {t("timerReminder.alertTitle")}
        </h1>
        <p
          id="timer-reminder-description"
          className="mt-5 max-w-2xl text-balance text-lg leading-8 text-slate-300 sm:text-xl"
        >
          {t("timerReminder.alertDescription", {
            minutes: thresholdMinutes,
          })}
        </p>

        <button
          type="button"
          autoFocus
          onClick={() => void getCurrentWindow().hide()}
          className="mt-10 rounded-xl bg-[var(--accent)] px-7 py-3 text-base font-semibold text-white shadow-lg shadow-blue-950/40 transition hover:bg-[var(--accent-hover)] focus:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-4 focus-visible:ring-offset-slate-950"
        >
          {t("timerReminder.dismiss")}
        </button>
        <p className="mt-4 text-xs text-slate-500">
          {t("timerReminder.escapeHint")}
        </p>
      </div>
    </main>
  );
}
