import { emitTo } from "@tauri-apps/api/event";
import { Window } from "@tauri-apps/api/window";

export const REMINDER_WINDOW_LABEL = "timer-reminder";
export const REMINDER_SHOW_EVENT = "kimai://reminder-show";
export const IDLE_REMINDER_ACTION_EVENT = "kimai://idle-reminder-action";

export type IdleReminderAction =
  | "continue"
  | "stop-at-start"
  | "stop-now"
  | "stop-and-new";

export type ReminderShowPayload =
  | { kind: "timer" }
  | {
      kind: "idle";
      test: boolean;
      idleStartedAtIso: string;
      idleDurationSeconds: number;
      project: string;
      activity: string;
      processing: boolean;
      error: string | null;
    };

export async function showFullscreenReminder(
  payload: ReminderShowPayload,
): Promise<boolean> {
  const reminder = await Window.getByLabel(REMINDER_WINDOW_LABEL);
  if (!reminder) return false;
  await emitTo(REMINDER_WINDOW_LABEL, REMINDER_SHOW_EVENT, payload);
  await reminder.setSimpleFullscreen(true);
  await reminder.show();
  await reminder.setFocus();
  return true;
}

export async function updateFullscreenReminder(
  payload: ReminderShowPayload,
): Promise<void> {
  await emitTo(REMINDER_WINDOW_LABEL, REMINDER_SHOW_EVENT, payload);
}

export async function hideFullscreenReminder(): Promise<void> {
  const reminder = await Window.getByLabel(REMINDER_WINDOW_LABEL);
  await reminder?.hide();
}
