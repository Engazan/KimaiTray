/**
 * Tracks recent user interaction inside the window, so layout animations can
 * run for changes the user caused (clicks, keys) but not for data that simply
 * finishes loading, e.g. when the popup is opened for the first time.
 */

/** Long enough to cover the server round trips of a timer switch. */
export const USER_INTENT_WINDOW_MS = 4000;

let lastIntentAt = Number.NEGATIVE_INFINITY;

export function markUserIntent(now = performance.now()) {
  lastIntentAt = now;
}

export function hasRecentUserIntent(now = performance.now()): boolean {
  return now - lastIntentAt <= USER_INTENT_WINDOW_MS;
}

export function resetUserIntent() {
  lastIntentAt = Number.NEGATIVE_INFINITY;
}

export function installUserIntentTracking(target: Document = document): () => void {
  const mark = () => markUserIntent();
  target.addEventListener("pointerdown", mark, true);
  target.addEventListener("keydown", mark, true);
  return () => {
    target.removeEventListener("pointerdown", mark, true);
    target.removeEventListener("keydown", mark, true);
  };
}
