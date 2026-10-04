import { useState, useCallback, useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { KimaiClient } from "../api/kimaiClient";
import { acquireTimerOperation } from "./timerOperationLock";
import { invalidateTimesheets } from "./invalidateTimesheets";
import type { KimaiTimesheetEntry } from "../api/kimaiTypes";
import {
  switchTask,
  TaskSwitchError,
  TaskMetadataError,
  type StartTaskPayload,
} from "../services/timerService";

export {
  switchTask,
  TaskSwitchError,
  TaskMetadataError,
  type StartTaskPayload,
} from "../services/timerService";

/** What the popup shows while a start request is still in flight. */
export interface StartPreview {
  project: string;
  activity: string;
  projectColor: string;
  activityColor: string;
  customerColor: string;
  description?: string;
  tags?: string[];
}

/** A start that failed transiently and is queued for another attempt. */
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

interface RetryControl {
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

export function useStartTask(
  client: KimaiClient | null,
  onTaskStarted?: (
    entry: KimaiTimesheetEntry,
    payload: StartTaskPayload,
  ) => void,
  onTaskFailed?: (error: Error, payload: StartTaskPayload) => void,
) {
  const qc = useQueryClient();
  const [startingKey, setStartingKey] = useState<string | null>(null);
  const [switchError, setSwitchError] = useState<string | null>(null);
  const [pendingPreview, setPendingPreview] = useState<StartPreview | null>(null);
  const [isStarting, setIsStarting] = useState(false);
  const [startRetry, setStartRetry] = useState<StartRetryState | null>(null);
  const previewShownRef = useRef(false);
  const controlRef = useRef<RetryControl | null>(null);
  // Timer that replaced a pending-start preview in place, so the popup can
  // skip its entry animation.
  const [handoffTimerId, setHandoffTimerId] = useState<number | null>(null);
  // A queued start can outlive the render that issued it; use the latest callbacks.
  const callbacksRef = useRef({ onTaskStarted, onTaskFailed });
  useEffect(() => {
    callbacksRef.current = { onTaskStarted, onTaskFailed };
  });

  // A queued start belongs to the connection it was made for.
  useEffect(() => () => {
    const control = controlRef.current;
    if (!control) return;
    control.cancelled = true;
    control.wake?.();
  }, [client]);

  const startTask = useCallback(
    async (
      payload: StartTaskPayload,
      trackingKey?: string,
      preview?: StartPreview,
    ): Promise<KimaiTimesheetEntry | null> => {
      if (!client || controlRef.current) return null;
      const release = acquireTimerOperation(qc, client.cacheScope);
      if (!release) return null;
      const control: RetryControl = { cancelled: false, wake: null };
      controlRef.current = control;

      // Publish the created entry right away so the active card does not wait
      // for the follow-up refetch; the invalidation still reconciles it.
      const publishActive = (entry: KimaiTimesheetEntry) => {
        qc.setQueryData(["active-timesheets", client.cacheScope], [entry]);
        if (previewShownRef.current) setHandoffTimerId(entry.id);
        previewShownRef.current = false;
        setPendingPreview(null);
      };

      const fail = (err: Error) => {
        setPendingPreview(null);
        const refresh = invalidateTimesheets(qc);

        if (err instanceof TaskMetadataError) {
          setSwitchError(
            `Timer started, but custom field data could not be saved: ${err.message}`,
          );
          // Creation already succeeded. Publish the running timer so callers can
          // close the form and keep any other post-start associations intact.
          publishActive(err.entry);
          callbacksRef.current.onTaskStarted?.(err.entry, payload);
          return refresh;
        }
        if (control.cancelled) {
          // The user withdrew the queued start; nothing to report.
        } else if (err instanceof TaskSwitchError && err.recoveryBlocked) {
          setSwitchError(
            `Could not safely complete the switch to "${payload.label}". No previous timer was restarted. Check the current timer before trying again: ${err.message}`,
          );
        } else if (err instanceof TaskSwitchError && err.stoppedExisting) {
          setSwitchError(
            `Timer stopped but "${payload.label}" failed to start: ${err.message}`,
          );
        } else {
          setSwitchError(`Failed to start "${payload.label}": ${err.message}`);
        }
        callbacksRef.current.onTaskFailed?.(err, payload);
        return refresh;
      };

      setIsStarting(true);
      setSwitchError(null);
      setStartingKey(trackingKey ?? null);
      previewShownRef.current = !!preview;
      setPendingPreview(preview ?? null);
      const firstAttemptAt = new Date();
      try {
        for (let attempt = 0; ; attempt++) {
          try {
            const entry = await switchTask(
              client,
              payload,
              attempt > 0 ? { adoptSince: firstAttemptAt } : undefined,
            );
            setStartingKey(null);
            publishActive(entry);
            const refresh = invalidateTimesheets(qc);
            callbacksRef.current.onTaskStarted?.(entry, payload);
            await refresh;
            return entry;
          } catch (caught) {
            const err = caught instanceof Error ? caught : new Error(String(caught));
            if (
              control.cancelled ||
              !(err instanceof TaskSwitchError && err.retryable)
            ) {
              setStartingKey(null);
              await fail(err);
              return null;
            }
            const delay =
              START_RETRY_DELAYS_MS[Math.min(attempt, START_RETRY_DELAYS_MS.length - 1)];
            setStartRetry({
              label: payload.label,
              attempt: attempt + 1,
              nextRetryAt: Date.now() + delay,
              lastError: err.message,
            });
            // The failed attempt may have stopped the previous timer.
            void invalidateTimesheets(qc);
            await waitForRetry(delay, control);
            if (control.cancelled) {
              setStartingKey(null);
              await fail(err);
              return null;
            }
            setStartRetry((current) => current && { ...current, nextRetryAt: null });
          }
        }
      } finally {
        controlRef.current = null;
        previewShownRef.current = false;
        setPendingPreview(null);
        setStartRetry(null);
        setIsStarting(false);
        release();
      }
    },
    [client, qc],
  );

  const retryStartNow = useCallback(() => controlRef.current?.wake?.(), []);

  const cancelStartRetry = useCallback(() => {
    const control = controlRef.current;
    if (!control) return;
    control.cancelled = true;
    control.wake?.();
  }, []);

  const dismissError = useCallback(() => setSwitchError(null), []);

  return {
    startTask,
    startingKey,
    switchError,
    dismissError,
    isStarting,
    pendingPreview,
    handoffTimerId,
    startRetry,
    retryStartNow,
    cancelStartRetry,
  };
}
