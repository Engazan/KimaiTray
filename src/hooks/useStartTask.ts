import { useState, useCallback } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { KimaiClient } from "../api/kimaiClient";
import { KimaiApiError } from "../api/kimaiClient";
import {
  getActiveTimesheets,
  restartTimesheet,
  startTimesheet,
  stopTimesheet,
  updateTimesheetMeta,
} from "../api/timesheetApi";
import { serializeKimaiTags } from "../api/tagUtils";
import { acquireTimerOperation } from "./timerOperationLock";
import { invalidateTimesheets } from "./invalidateTimesheets";
import type { KimaiTimesheetEntry } from "../api/kimaiTypes";

export interface StartTaskPayload {
  projectId: number;
  activityId: number;
  begin?: string;
  description?: string;
  tags?: string[];
  metadata?: Record<string, string>;
  label: string;
}

export class TaskSwitchError extends Error {
  stoppedExisting: boolean;
  constructor(
    cause: unknown,
    stoppedExisting: boolean,
    readonly recoveryBlocked: boolean = false,
  ) {
    super(cause instanceof KimaiApiError ? cause.message : String(cause));
    this.stoppedExisting = stoppedExisting;
  }
}

export class TaskMetadataError extends Error {
  readonly entry: KimaiTimesheetEntry;

  constructor(cause: unknown, entry: KimaiTimesheetEntry) {
    super(cause instanceof KimaiApiError ? cause.message : String(cause));
    this.entry = entry;
  }
}

export async function switchTask(
  client: KimaiClient,
  payload: StartTaskPayload,
) {
  let stoppedExisting = false;
  let startAttempted = false;
  const stoppedIds: number[] = [];
  let entry: KimaiTimesheetEntry;
  try {
    const active = await getActiveTimesheets(client);
    for (const entry of active) {
      await stopTimesheet(client, entry.id);
      stoppedExisting = true;
      stoppedIds.push(entry.id);
    }
    startAttempted = true;
    entry = await startTimesheet(client, {
      project: payload.projectId,
      activity: payload.activityId,
      begin: payload.begin,
      description: payload.description,
      tags: payload.tags?.length
        ? serializeKimaiTags(payload.tags)
        : undefined,
    });
  } catch (err) {
    if (startAttempted) {
      // A timeout, failed response parsing, or server error does not prove the
      // create failed. Only an explicit rejection permits automatic recovery.
      const rejected =
        err instanceof KimaiApiError &&
        err.status >= 400 &&
        err.status < 500 &&
        err.status !== 408;

      if (stoppedIds.length > 0 || !rejected) {
        const active = await getActiveTimesheets(client).catch(() => null);
        // Even an empty snapshot cannot rule out an in-flight create committing
        // later. Never restart automatically after an ambiguous create result.
        // Do not infer ownership of a running entry from matching task fields.
        if (!rejected || active === null || active.length > 0) {
          throw new TaskSwitchError(err, stoppedExisting, true);
        }
      }
    }
    let rolledBack = stoppedIds.length > 0;
    for (const id of [...stoppedIds].reverse()) {
      try {
        await restartTimesheet(client, id);
      } catch {
        rolledBack = false;
      }
    }
    throw new TaskSwitchError(err, stoppedExisting && !rolledBack);
  }

  try {
    for (const [name, rawValue] of Object.entries(payload.metadata ?? {})) {
      const value = rawValue.trim();
      if (!name || !value) continue;
      await updateTimesheetMeta(client, entry.id, {
        name,
        value,
      });
    }
  } catch (error) {
    // The new timer already exists and may be running. Do not restart the
    // previously stopped timer and accidentally leave two active timers.
    throw new TaskMetadataError(error, entry);
  }

  return entry;
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
