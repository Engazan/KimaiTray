import { useState, useCallback } from "react";
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

  const mutation = useMutation({
    mutationFn: (payload: StartTaskPayload) => switchTask(client!, payload),
    onMutate: () => {
      setSwitchError(null);
    },
    onSuccess: (entry, payload) => {
      setStartingKey(null);
      const refresh = invalidateTimesheets(qc);
      onTaskStarted?.(entry, payload);
      return refresh;
    },
    onError: (err: Error, payload) => {
      setStartingKey(null);
      const refresh = invalidateTimesheets(qc);

      if (err instanceof TaskMetadataError) {
        setSwitchError(
          `Timer started, but custom field data could not be saved: ${err.message}`,
        );
        // Creation already succeeded. Publish the running timer so callers can
        // close the form and keep any other post-start associations intact.
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
    ): Promise<KimaiTimesheetEntry | null> => {
      if (!client || mutation.isPending) return null;
      const release = acquireTimerOperation(qc, client.cacheScope);
      if (!release) return null;
      setStartingKey(trackingKey ?? null);
      try {
        return await mutation.mutateAsync(payload);
      } catch {
        // The mutation callbacks already publish the user-facing error state.
        return null;
      } finally {
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
  };
}
