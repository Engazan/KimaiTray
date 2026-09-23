import { useState, useCallback, useRef } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
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
  const previewShownRef = useRef(false);
  // Timer that replaced a pending-start preview in place, so the popup can
  // skip its entry animation.
  const [handoffTimerId, setHandoffTimerId] = useState<number | null>(null);

  // Publish the created entry right away so the active card does not wait for
  // the follow-up refetch; the invalidation below still reconciles it.
  const publishActive = (entry: KimaiTimesheetEntry) => {
    if (client) qc.setQueryData(["active-timesheets", client.cacheScope], [entry]);
    if (previewShownRef.current) setHandoffTimerId(entry.id);
    previewShownRef.current = false;
    setPendingPreview(null);
  };

  const mutation = useMutation({
    mutationFn: (payload: StartTaskPayload) => switchTask(client!, payload),
    onMutate: () => {
      setSwitchError(null);
    },
    onSuccess: (entry, payload) => {
      setStartingKey(null);
      publishActive(entry);
      const refresh = invalidateTimesheets(qc);
      onTaskStarted?.(entry, payload);
      return refresh;
    },
    onError: (err: Error, payload) => {
      setStartingKey(null);
      setPendingPreview(null);
      const refresh = invalidateTimesheets(qc);

      if (err instanceof TaskMetadataError) {
        setSwitchError(
          `Timer started, but custom field data could not be saved: ${err.message}`,
        );
        // Creation already succeeded. Publish the running timer so callers can
        // close the form and keep any other post-start associations intact.
        publishActive(err.entry);
        onTaskStarted?.(err.entry, payload);
        return refresh;
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
      onTaskFailed?.(err, payload);
      return refresh;
    },
  });

  const startTask = useCallback(
    async (
      payload: StartTaskPayload,
      trackingKey?: string,
      preview?: StartPreview,
    ): Promise<KimaiTimesheetEntry | null> => {
      if (!client || mutation.isPending) return null;
      const release = acquireTimerOperation(qc, client.cacheScope);
      if (!release) return null;
      setStartingKey(trackingKey ?? null);
      previewShownRef.current = !!preview;
      setPendingPreview(preview ?? null);
      try {
        return await mutation.mutateAsync(payload);
      } catch {
        // The mutation callbacks already publish the user-facing error state.
        return null;
      } finally {
        previewShownRef.current = false;
        setPendingPreview(null);
        release();
      }
    },
    [client, mutation, qc],
  );

  const dismissError = useCallback(() => setSwitchError(null), []);

  return {
    startTask,
    startingKey,
    switchError,
    dismissError,
    isStarting: mutation.isPending,
    pendingPreview,
    handoffTimerId,
  };
}
