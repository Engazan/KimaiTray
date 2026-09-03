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
  constructor(cause: unknown, stoppedExisting: boolean) {
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
  const stoppedIds: number[] = [];
  let entry: KimaiTimesheetEntry;
  try {
    const active = await getActiveTimesheets(client);
    for (const entry of active) {
      await stopTimesheet(client, entry.id);
      stoppedExisting = true;
      stoppedIds.push(entry.id);
    }
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
      invalidateTimesheets(qc);
      onTaskStarted?.(entry, payload);
    },
    onError: (err: Error, payload) => {
      setStartingKey(null);
      invalidateTimesheets(qc);

      if (err instanceof TaskMetadataError) {
        setSwitchError(
          `Timer started, but custom field data could not be saved: ${err.message}`,
        );
        // Creation already succeeded. Publish the running timer so callers can
        // close the form and keep any other post-start associations intact.
        onTaskStarted?.(err.entry, payload);
        return;
      } else if (err instanceof TaskSwitchError && err.stoppedExisting) {
        setSwitchError(
          `Timer stopped but "${payload.label}" failed to start: ${err.message}`,
        );
      } else {
        setSwitchError(`Failed to start "${payload.label}": ${err.message}`);
      }
      onTaskFailed?.(err, payload);
    },
  });

  const startTask = useCallback(
    async (
      payload: StartTaskPayload,
      trackingKey?: string,
    ): Promise<KimaiTimesheetEntry | null> => {
      if (!client || mutation.isPending) return null;
      setStartingKey(trackingKey ?? null);
      try {
        return await mutation.mutateAsync(payload);
      } catch {
        // The mutation callbacks already publish the user-facing error state.
        return null;
      }
    },
    [client, mutation],
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
