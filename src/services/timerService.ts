import { KimaiApiError, type KimaiClient } from "../api/kimaiClient";
import {
  getActiveTimesheets,
  restartTimesheet,
  startTimesheet,
  stopTimesheet,
  updateTimesheet,
  updateTimesheetMeta,
} from "../api/timesheetApi";
import { serializeKimaiTags } from "../api/tagUtils";
import type { KimaiTimesheetEntry } from "../api/kimaiTypes";
import { toKimaiLocal } from "../utils/time";

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

/** Stop at an idle boundary, optionally falling back to the current time.
 * Lock ownership and cache refresh belong to the caller's operation lifecycle.
 */
export async function stopTimerAtIdleBoundary(
  client: KimaiClient,
  timerId: number,
  idleStartedAt: Date,
  fallbackToNow = false,
): Promise<void> {
  try {
    await updateTimesheet(client, timerId, { end: toKimaiLocal(idleStartedAt) });
  } catch (error) {
    if (!fallbackToNow) throw error;
    await stopTimesheet(client, timerId);
  }
}
