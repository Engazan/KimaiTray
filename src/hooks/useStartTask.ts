import { useState, useCallback, useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { KimaiClient } from "../api/kimaiClient";
import { acquireTimerOperation } from "./timerOperationLock";
import { invalidateTimesheets } from "./invalidateTimesheets";
import { publishStartedTimesheet } from "./publishStartedTimesheet";
import type { KimaiTimesheetEntry } from "../api/kimaiTypes";
import { parseKimaiDate } from "../utils/time";
import { cancelRetry, retryStart, type RetryControl, type StartRetryState } from "./startRetry";
import {
  switchTask,
  TaskSwitchError,
  TaskMetadataError,
  type StartTaskPayload,
} from "../services/timerService";

export { START_RETRY_DELAYS_MS, type StartRetryState } from "./startRetry";
export {
  switchTask,
  TaskSwitchError,
  TaskMetadataError,
  type StartTaskPayload,
} from "../services/timerService";

/** The running entries after `started` joined `previous` under `limit`: the
 * newest `limit` entries, as Kimai stops the oldest beyond its hard limit. */
export function withStartedEntry(
  previous: KimaiTimesheetEntry[] | undefined,
  started: KimaiTimesheetEntry,
  limit: number,
): KimaiTimesheetEntry[] {
  if (limit <= 1) return [started];
  return [...(previous ?? []).filter((entry) => entry.id !== started.id), started]
    .sort((a, b) => parseKimaiDate(a.begin).getTime() - parseKimaiDate(b.begin).getTime())
    .slice(-limit);
}

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

export function useStartTask(
  client: KimaiClient | null,
  onTaskStarted?: (
    entry: KimaiTimesheetEntry,
    payload: StartTaskPayload,
  ) => void,
  onTaskFailed?: (error: Error, payload: StartTaskPayload) => void,
  activeLimit = 1,
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
  const activeLimitRef = useRef(activeLimit);
  useEffect(() => {
    callbacksRef.current = { onTaskStarted, onTaskFailed };
    activeLimitRef.current = activeLimit;
  });

  // A queued start belongs to the connection it was made for.
  useEffect(() => () => cancelRetry(controlRef.current), [client]);

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

      // Publish the created entry right away so the active card, Recent and
      // Today change together instead of each on its own refetch; the
      // invalidation still reconciles them.
      const publishActive = (entry: KimaiTimesheetEntry) => {
        qc.setQueryData<KimaiTimesheetEntry[]>(
          ["active-timesheets", client.cacheScope],
          (previous) => withStartedEntry(previous, entry, activeLimitRef.current),
        );
        publishStartedTimesheet(qc, client.cacheScope, entry);
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
        const entry = await retryStart(
          (attempt) => switchTask(client, payload, {
            adoptSince: attempt > 0 ? firstAttemptAt : undefined,
            activeLimit: activeLimitRef.current,
          }),
          control,
          payload.label,
          (state) => {
            setStartRetry(state);
            // The failed attempt may have stopped the previous timer.
            if (state.nextRetryAt !== null) void invalidateTimesheets(qc);
          },
        );
        setStartingKey(null);
        publishActive(entry);
        const refresh = invalidateTimesheets(qc);
        callbacksRef.current.onTaskStarted?.(entry, payload);
        await refresh;
        return entry;
      } catch (caught) {
        setStartingKey(null);
        await fail(caught instanceof Error ? caught : new Error(String(caught)));
        return null;
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

  const cancelStartRetry = useCallback(() => cancelRetry(controlRef.current), []);

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
