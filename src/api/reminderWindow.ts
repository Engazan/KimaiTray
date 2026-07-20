import { emitTo } from "@tauri-apps/api/event";
import { getCurrentWindow, Window } from "@tauri-apps/api/window";
import { currentPlatform } from "../platform";

export const REMINDER_WINDOW_LABEL = "timer-reminder";
export const REMINDER_SHOW_EVENT = "kimai://reminder-show";
export const REMINDER_RENDERED_EVENT = "kimai://reminder-rendered";
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

export interface ReminderShowRequest {
  requestId: string;
  replyTo: string;
  payload: ReminderShowPayload;
}

export interface ReminderRenderedPayload {
  requestId: string;
}

const RENDER_ACK_TIMEOUT_MS = 2_000;
let reminderRequestSequence = 0;

async function sendContentAndWaitForRender(
  payload: ReminderShowPayload,
): Promise<void> {
  const source = getCurrentWindow();
  const requestId = `${source.label}-${Date.now()}-${++reminderRequestSequence}`;
  let acknowledgeRender: (() => void) | undefined;
  const rendered = new Promise<void>((resolve) => {
    acknowledgeRender = resolve;
  });
  const unlisten = await source.listen<ReminderRenderedPayload>(
    REMINDER_RENDERED_EVENT,
    ({ payload: acknowledgement }) => {
      if (acknowledgement.requestId === requestId) acknowledgeRender?.();
    },
  );
  let timeout: ReturnType<typeof setTimeout> | undefined;
  const renderTimedOut = new Promise<never>((_, reject) => {
    timeout = setTimeout(
      () => reject(new Error("Reminder window did not render in time")),
      RENDER_ACK_TIMEOUT_MS,
    );
  });

  try {
    await emitTo(REMINDER_WINDOW_LABEL, REMINDER_SHOW_EVENT, {
      requestId,
      replyTo: source.label,
      payload,
    } satisfies ReminderShowRequest);
    await Promise.race([rendered, renderTimedOut]);
  } finally {
    if (timeout !== undefined) clearTimeout(timeout);
    unlisten();
  }
}

export async function showFullscreenReminder(
  payload: ReminderShowPayload,
): Promise<boolean> {
  const reminder = await Window.getByLabel(REMINDER_WINDOW_LABEL);
  if (!reminder) return false;
  const platform = currentPlatform();
  if (platform.os === "linux" && platform.session === "x11") {
    // The previous simple-fullscreen surface is disposed when the reminder is
    // dismissed. Map its replacement before rendering so WebKitGTK paints the
    // new X11 surface instead of retaining translucent compositor layers.
    await reminder.setSimpleFullscreen(true);
    await reminder.show();
    await reminder.setSimpleFullscreen(true);
    await sendContentAndWaitForRender(payload);
    await reminder.setFocus();
    return true;
  }
  await sendContentAndWaitForRender(payload);
  // Keep the pre-show request for macOS and Windows, where it avoids mapping
  // the configured 800x600 window before fullscreen is applied. Simple
  // fullscreen also preserves the no-new-Space behavior on macOS.
  await reminder.setSimpleFullscreen(true);
  await reminder.show();
  // X11 window managers can ignore fullscreen state changes made while a
  // window is still hidden, so repeat the idempotent request after mapping it.
  await reminder.setSimpleFullscreen(true);
  await reminder.setFocus();
  return true;
}

export async function updateFullscreenReminder(
  payload: ReminderShowPayload,
): Promise<void> {
  await sendContentAndWaitForRender(payload);
}

export async function hideFullscreenReminder(): Promise<void> {
  const reminder = await Window.getByLabel(REMINDER_WINDOW_LABEL);
  if (!reminder) return;
  const platform = currentPlatform();
  if (platform.os === "linux" && platform.session === "x11") {
    await reminder.setSimpleFullscreen(false);
  }
  await reminder.hide();
}
