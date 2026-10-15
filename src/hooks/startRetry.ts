import { TaskSwitchError } from "../services/timerService";

/** A start that failed and is queued for another attempt. */
export interface StartRetryState {
  label: string;
  /** Failed attempts so far. */
  attempt: number;
  /** When the next attempt fires; null while it is in flight. */
  nextRetryAt: number | null;
  lastError: string;
}

/** Backoff between attempts; the last delay repeats until the start succeeds. */
export const START_RETRY_DELAYS_MS = [2_000, 5_000, 10_000, 20_000, 30_000, 60_000];

export interface RetryControl {
  cancelled: boolean;
  wake: (() => void) | null;
}

/** Resolve after `ms`, when the network comes back, or when woken early. */
function waitForRetry(ms: number, control: RetryControl): Promise<void> {
  return new Promise((resolve) => {
    const done = () => {
      window.clearTimeout(timeout);
      window.removeEventListener("online", done);
      control.wake = null;
      resolve();
    };
    const timeout = window.setTimeout(done, ms);
    window.addEventListener("online", done);
    control.wake = done;
  });
}

/** Withdraw a queued start; its pending wait resolves right away. */
export function cancelRetry(control: RetryControl | null): void {
  if (!control) return;
  control.cancelled = true;
  control.wake?.();
}

/**
 * Run `attempt` until it succeeds. A retryable TaskSwitchError queues another
 * attempt with backoff and reports it through `onQueued`; any other failure,
 * or cancelling `control`, rethrows the last error.
 */
export async function retryStart<T>(
  attempt: (index: number) => Promise<T>,
  control: RetryControl,
  label: string,
  onQueued: (state: StartRetryState) => void,
): Promise<T> {
  for (let index = 0; ; index++) {
    try {
      return await attempt(index);
    } catch (caught) {
      const err = caught instanceof Error ? caught : new Error(String(caught));
      if (control.cancelled || !(err instanceof TaskSwitchError && err.retryable)) {
        throw err;
      }
      const delay = START_RETRY_DELAYS_MS[Math.min(index, START_RETRY_DELAYS_MS.length - 1)];
      const state = {
        label,
        attempt: index + 1,
        nextRetryAt: Date.now() + delay,
        lastError: err.message,
      };
      onQueued(state);
      await waitForRetry(delay, control);
      if (control.cancelled) throw err;
      onQueued({ ...state, nextRetryAt: null });
    }
  }
}
