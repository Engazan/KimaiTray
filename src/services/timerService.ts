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
import { extractId, type KimaiTimesheetEntry } from "../api/kimaiTypes";
import { parseKimaiDate, toKimaiLocal } from "../utils/time";

export interface StartTaskPayload {
  projectId: number;
  activityId: number;
  begin?: string;
  description?: string;
  tags?: string[];
  metadata?: Record<string, string>;
  label: string;
}

/** Kimai answers a rejected timesheet form with HTTP 400 "Validation Failed".
 * The begin time comes from the server clock, so this mostly means a time rule
 * for the user (lockdown period, rounding, overlap) forbids starting right
 * now; the same start can pass a little later. */
export function isTimeRuleRejection(err: unknown): boolean {
  return err instanceof KimaiApiError && err.status === 400;
}

export class TaskSwitchError extends Error {
  stoppedExisting: boolean;
  /** The failure looks transient (offline, timeout, server error, a time rule
   * rejecting the server's current time), so the whole switch may be attempted
   * again. */
  readonly retryable: boolean;
  constructor(
    cause: unknown,
    stoppedExisting: boolean,
    readonly recoveryBlocked: boolean = false,
  ) {
    super(cause instanceof Error ? cause.message : String(cause));
    this.stoppedExisting = stoppedExisting;
    this.retryable =
      isTimeRuleRejection(cause) ||
      (cause instanceof KimaiApiError &&
        (cause.code === "network_error" ||
          cause.code === "server_error" ||
          cause.status === 408 ||
          cause.status === 429));
  }
}

export interface SwitchTaskOptions {
  /** A previous attempt for this payload may have created the timer even
   * though its response was lost. A running entry for the same project and
   * activity that began after this moment is adopted instead of creating a
   * duplicate. */
  adoptSince?: Date;
  /** How many timers the instance lets run at once. Only the oldest running
   * entries beyond `activeLimit - 1` are stopped before the new one starts. */
  activeLimit?: number;
}

/** Running entries to stop so that, with one more started, at most `limit`
 * remain. The oldest go first, matching how Kimai enforces its hard limit. */
export function entriesToStop(
  active: KimaiTimesheetEntry[],
  limit: number,
): KimaiTimesheetEntry[] {
  const excess = active.length - Math.max(1, limit) + 1;
  if (excess <= 0) return [];
  return [...active]
    .sort((a, b) => parseKimaiDate(a.begin).getTime() - parseKimaiDate(b.begin).getTime())
    .slice(0, excess);
}

// Tolerates clock skew between this machine and the Kimai server.
const ADOPT_CLOCK_SKEW_MS = 2 * 60_000;

function findAdoptable(
  active: KimaiTimesheetEntry[],
  payload: StartTaskPayload,
  since: Date,
): KimaiTimesheetEntry | undefined {
  const threshold = since.getTime() - ADOPT_CLOCK_SKEW_MS;
  return active.find(
    (entry) =>
      extractId(entry.project) === payload.projectId &&
      extractId(entry.activity) === payload.activityId &&
      parseKimaiDate(entry.begin).getTime() >= threshold,
  );
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
  options: SwitchTaskOptions = {},
) {
  let stoppedExisting = false;
  let startAttempted = false;
  const stoppedIds: number[] = [];
  // Running entries this switch deliberately leaves alone.
  const keptIds = new Set<number>();
  let entry: KimaiTimesheetEntry;
  try {
    const active = await getActiveTimesheets(client);
    const adopted = options.adoptSince
      ? findAdoptable(active, payload, options.adoptSince)
      : undefined;
    // An adopted entry is the timer being started, so it never counts against
    // the limit and is never stopped.
    const others = active.filter((entry) => entry !== adopted);
    const toStop = entriesToStop(others, options.activeLimit ?? 1);
    for (const entry of others) {
      if (!toStop.includes(entry)) keptIds.add(entry.id);
    }
    for (const entry of toStop) {
      await stopTimesheet(client, entry.id);
      stoppedExisting = true;
      stoppedIds.push(entry.id);
    }
    startAttempted = true;
    entry = adopted ?? await startTimesheet(client, {
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
        // Timers kept running alongside the new one are expected.
        const unexpected = active?.some((entry) => !keptIds.has(entry.id));
        if (!rejected || active === null || unexpected) {
          throw new TaskSwitchError(err, stoppedExisting, true);
        }
      }
    }
    if (startAttempted && isTimeRuleRejection(err)) {
      // Restarting the stopped timers would hit the same time rule, and the
      // queued retry would only stop them again.
      throw new TaskSwitchError(err, stoppedExisting);
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
