import { useCallback, useEffect, useState } from "react";
import { flushSync } from "react-dom";
import { useTranslation } from "react-i18next";
import { emitTo } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import type { AppSettings } from "../types";
import type {
  IdleReminderAction,
  ReminderShowRequest,
  ReminderShowPayload,
} from "../api/reminderWindow";
import {
  IDLE_REMINDER_ACTION_EVENT,
  REMINDER_RENDERED_EVENT,
  REMINDER_SHOW_EVENT,
} from "../api/reminderWindow";
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

function formatDuration(totalSeconds: number): string {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  if (hours > 0) return `${hours}h ${minutes}m`;
  if (minutes > 0) return `${minutes} min`;
  return `${totalSeconds}s`;
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function TimerReminder() {
  const { t } = useTranslation();
  const [thresholdMinutes, setThresholdMinutes] = useState(
    defaultSettings.noTimerReminderMinutes,
  );
  const [content, setContent] = useState<ReminderShowPayload | null>(null);
  useLanguageSync();

  useEffect(() => {
    const apply = (settings: AppSettings) => {
      setThresholdMinutes(settings.noTimerReminderMinutes);
      applyAppearance(settings);
    };

    void loadSettings().then(apply);
    const cleanup = onSettingsChange(apply);
    return () => {
      cleanup.then((unlisten) => unlisten());
    };
  }, []);

  useEffect(() => {
    const unlisten = getCurrentWindow().listen<ReminderShowRequest>(
      REMINDER_SHOW_EVENT,
      ({ payload: request }) => {
        // Tauri event delivery does not wait for React to commit the update.
        // Commit synchronously so the sender can safely show this window only
        // after the new reminder has replaced the previous frame.
        flushSync(() => setContent(request.payload));
        void emitTo(request.replyTo, REMINDER_RENDERED_EVENT, {
          requestId: request.requestId,
        }).catch((error) => {
          logger.error(`Failed to acknowledge reminder render: ${String(error)}`);
        });
      },
    );
    return () => {
      unlisten.then((cleanup) => cleanup());
    };
  }, []);

  const sendIdleAction = useCallback(async (action: IdleReminderAction) => {
    setContent((current) =>
      current?.kind === "idle"
        ? { ...current, processing: true, error: null }
        : current,
    );
    try {
      await emitTo("tray-popup", IDLE_REMINDER_ACTION_EVENT, { action });
    } catch (error) {
      logger.error(`Failed to send idle reminder action: ${String(error)}`);
      setContent((current) =>
        current?.kind === "idle"
          ? { ...current, processing: false, error: t("common.somethingWentWrong") }
          : current,
      );
    }
  }, [t]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      if (content?.kind === "idle" && !content.test) {
        void sendIdleAction("continue");
      } else {
        void getCurrentWindow().hide();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [content, sendIdleAction]);

  if (!content) {
    return <main aria-hidden="true" className="h-screen w-screen bg-slate-950" />;
  }

  if (content.kind === "idle") {
    const idleTime = formatTime(content.idleStartedAtIso);
    const buttonBase =
      "rounded-xl px-5 py-3 text-sm font-semibold transition focus:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-4 focus-visible:ring-offset-slate-950 disabled:cursor-not-allowed disabled:opacity-50";

    return (
      <main
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="idle-reminder-title"
        className="relative flex h-screen w-screen items-center justify-center overflow-hidden bg-slate-950/70 px-6 text-white"
      >
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_35%,rgba(245,158,11,0.28),transparent_48%)]" />
        <div className="relative flex w-full max-w-3xl flex-col items-center text-center">
          <div className="mb-7 flex h-24 w-24 items-center justify-center rounded-full border border-amber-200/20 bg-amber-400/10 shadow-2xl shadow-amber-500/20">
            <svg className="h-12 w-12 text-amber-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5} aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <p className="mb-3 text-sm font-semibold uppercase tracking-[0.24em] text-amber-300">
            KimaiTray
          </p>
          <h1 id="idle-reminder-title" className="text-balance text-4xl font-semibold tracking-tight sm:text-5xl">
            {content.test ? t("idle.testAlertTitle") : t("idle.youWereIdle")}
          </h1>
          <p className="mt-4 text-lg text-slate-300 sm:text-xl">
            {formatDuration(content.idleDurationSeconds)} {t("common.since", { time: idleTime })}
          </p>

          <div className="mt-7 w-full max-w-xl rounded-2xl border border-white/10 bg-black/20 px-5 py-4 backdrop-blur-sm">
            <p className="text-xs uppercase tracking-wider text-slate-400">{t("idle.activeTimer")}</p>
            <p className="mt-1 truncate text-base font-semibold">
              {content.project}
              <span className="font-normal text-slate-400"> — {content.activity}</span>
            </p>
          </div>

          {content.error && (
            <p role="alert" className="mt-5 w-full max-w-xl rounded-xl border border-red-300/20 bg-red-500/15 px-4 py-3 text-sm text-red-100">
              {content.error}
            </p>
          )}

          {content.test ? (
            <button
              type="button"
              autoFocus
              onClick={() => void getCurrentWindow().hide()}
              className={`${buttonBase} mt-8 bg-amber-500 text-slate-950 hover:bg-amber-400`}
            >
              {t("idle.closeTest")}
            </button>
          ) : (
            <div className="mt-8 grid w-full max-w-xl gap-3 sm:grid-cols-2">
              <button type="button" autoFocus disabled={content.processing} onClick={() => void sendIdleAction("continue")} className={`${buttonBase} bg-[var(--accent)] text-white hover:bg-[var(--accent-hover)]`}>
                {t("idle.continueKeep")}
              </button>
              <button type="button" disabled={content.processing} onClick={() => void sendIdleAction("stop-at-start")} className={`${buttonBase} bg-white/10 text-white hover:bg-white/20`}>
                {t("idle.stopAt", { time: idleTime })}
              </button>
              <button type="button" disabled={content.processing} onClick={() => void sendIdleAction("stop-now")} className={`${buttonBase} bg-white/10 text-white hover:bg-white/20`}>
                {t("idle.stopNow")}
              </button>
              <button type="button" disabled={content.processing} onClick={() => void sendIdleAction("stop-and-new")} className={`${buttonBase} bg-white/5 text-slate-300 hover:bg-white/15`}>
                {t("idle.stopAtAndNew", { time: idleTime })}
              </button>
            </div>
          )}
          {!content.test && (
            <p className="mt-4 text-xs text-slate-400">{t("idle.escapeContinues")}</p>
          )}
        </div>
      </main>
    );
  }

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
          <svg className="h-14 w-14 text-blue-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.4} aria-hidden="true">
            <circle cx="12" cy="12" r="8.25" />
            <path strokeLinecap="round" d="M12 7.75V12l2.75 1.75" />
            <path strokeLinecap="round" d="M8.5 3.9 6.9 2.3M15.5 3.9l1.6-1.6" />
          </svg>
        </div>
        <p className="mb-3 text-sm font-semibold uppercase tracking-[0.24em] text-blue-300">KimaiTray</p>
        <h1 id="timer-reminder-title" className="text-balance text-4xl font-semibold tracking-tight sm:text-5xl">
          {t("timerReminder.alertTitle")}
        </h1>
        <p id="timer-reminder-description" className="mt-5 max-w-2xl text-balance text-lg leading-8 text-slate-300 sm:text-xl">
          {t("timerReminder.alertDescription", { minutes: thresholdMinutes })}
        </p>
        <button type="button" onClick={() => void getCurrentWindow().hide()} className="mt-10 rounded-xl border-2 border-transparent bg-[var(--accent)] px-7 py-3 text-base font-semibold text-white transition hover:bg-[var(--accent-hover)] focus:outline-none focus-visible:border-white">
          {t("timerReminder.dismiss")}
        </button>
        <p className="mt-4 text-xs text-slate-400">{t("timerReminder.escapeHint")}</p>
      </div>
    </main>
  );
}
