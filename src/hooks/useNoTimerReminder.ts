import { useCallback, useEffect, useRef } from "react";
import { getCurrentWindow, Window } from "@tauri-apps/api/window";
import { logger } from "../utils/logger";

export type TimerPresence = "unknown" | "running" | "stopped";
export type ReminderWindowAction = "show" | "hide" | "none";

/**
 * Tracks one continuous period without an active timer. Dismissing the window
 * does not create a reminder loop: another reminder is armed only after a
 * timer has run again.
 */
export class NoTimerReminderTracker {
  private stoppedSince: number | null = null;
  private reminded = false;
  private windowVisible = false;

  update(
    now: number,
    enabled: boolean,
    thresholdMs: number,
    presence: TimerPresence,
  ): ReminderWindowAction {
    if (!enabled || presence !== "stopped") {
      const shouldHide = this.windowVisible;
      this.stoppedSince = null;
      this.reminded = false;
      this.windowVisible = false;
      return shouldHide ? "hide" : "none";
    }

    if (this.stoppedSince == null) this.stoppedSince = now;
    if (!this.reminded && now - this.stoppedSince >= thresholdMs) {
      this.reminded = true;
      this.windowVisible = true;
      return "show";
    }
    return "none";
  }

  remainingMs(now: number, thresholdMs: number): number | null {
    if (this.stoppedSince == null || this.reminded) return null;
    return Math.max(0, thresholdMs - (now - this.stoppedSince));
  }
}

interface UseNoTimerReminderOptions {
  enabled: boolean;
  thresholdMinutes: number;
  presence: TimerPresence;
}

const REMINDER_WINDOW_LABEL = "timer-reminder";

export function useNoTimerReminder({
  enabled,
  thresholdMinutes,
  presence,
}: UseNoTimerReminderOptions) {
  const trackerRef = useRef(new NoTimerReminderTracker());
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const optionsRef = useRef({ enabled, thresholdMinutes, presence });
  optionsRef.current = { enabled, thresholdMinutes, presence };

  const evaluate = useCallback(() => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);

    const now = Date.now();
    const options = optionsRef.current;
    const thresholdMs = options.thresholdMinutes * 60_000;
    const action = trackerRef.current.update(
      now,
      options.enabled,
      thresholdMs,
      options.presence,
    );

    if (action !== "none") {
      void Window.getByLabel(REMINDER_WINDOW_LABEL)
        .then(async (reminder) => {
          if (!reminder) return;
          if (action === "show") {
            await reminder.setSimpleFullscreen(true);
            await reminder.show();
            await reminder.setFocus();
          } else {
            await reminder.hide();
          }
        })
        .catch((error) => {
          logger.error(`Failed to ${action} timer reminder: ${String(error)}`);
        });
    }

    const remaining = trackerRef.current.remainingMs(now, thresholdMs);
    if (remaining != null) {
      timeoutRef.current = setTimeout(evaluate, Math.max(1, remaining));
    }
  }, []);

  useEffect(() => {
    evaluate();
  }, [enabled, thresholdMinutes, presence, evaluate]);

  useEffect(() => {
    const unlisten = getCurrentWindow().listen("kimai://tick", evaluate);
    return () => {
      unlisten.then((cleanup) => cleanup());
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, [evaluate]);
}
