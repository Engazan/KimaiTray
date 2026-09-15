import { SpentTimeRejectedError } from "./spentTimeError";
import type { KimaiClient } from "../../api/kimaiClient";
import type { KimaiTimesheetEntry } from "../../api/kimaiTypes";
import { getRecordedDurationSeconds } from "../../utils/timesheetDuration";
import type { ExternalIssue, IssueIntegrationSettings } from "./types";


export interface TimeSyncJob {
  id: string;
  connectionId: string;
  kimaiUrl: string;
  destination: string;
  timesheetId: number;
  issueId: number;
  issueUrl: string;
  status: "watching" | "sending" | "uncertain" | "done";
  nextAttemptAt: number;
  error: "read" | "rejected" | null;
}

export interface TimeSyncSession {
  client: KimaiClient;
  config: IssueIntegrationSettings;
  runningTimerId?: number;
  isCurrent: () => boolean;
  send: (job: TimeSyncJob, seconds: number) => Promise<void>;
}

export interface TimeSyncRepository {
  read(connectionId: string): Promise<TimeSyncJob[]>;
  write(connectionId: string, jobs: TimeSyncJob[]): Promise<void>;
}

export function timeSyncDestination(config: IssueIntegrationSettings): string {
  return JSON.stringify([config.provider, config.baseUrl.replace(/\/+$/, ""),
  config.apiBaseUrl.replace(/\/+$/, ""), config.projectPathOrRepo]);
}

export function matchesTimeSyncSession(job: TimeSyncJob, session: TimeSyncSession): boolean {
  return job.connectionId === session.client.connectionId &&
    job.kimaiUrl === session.client.baseUrl && job.destination === timeSyncDestination(session.config);
}

/** One writer in the tray window. A persisted sending state is never replayed.
 * Completion tombstones prevent rediscovery of a timesheet from posting twice.
 */
export class IssueTimeSyncQueue {
  private tail: Promise<unknown> = Promise.resolve();
  private pending = new Map<string, TimeSyncJob>();
  constructor(private readonly repository: TimeSyncRepository,
    private readonly getTimesheet: (client: KimaiClient, id: number) => Promise<KimaiTimesheetEntry>) { }

  private serial<T>(action: () => Promise<T>): Promise<T> {
    const result = this.tail.then(action);
    this.tail = result.catch(() => { });
    return result;
  }

  private async persistTracked(connectionId: string): Promise<void> {
    const pending = [...this.pending.entries()].filter(([, job]) => job.connectionId === connectionId);
    if (pending.length === 0) return;
    const jobs = await this.repository.read(connectionId);
    let changed = false;
    for (const [, job] of pending) {
      if (!jobs.some((existing) => existing.id === job.id)) {
        jobs.push(job);
        changed = true;
      }
    }
    if (changed) await this.repository.write(connectionId, jobs);
    for (const [key] of pending) this.pending.delete(key);
  }

  track(session: TimeSyncSession, timesheetId: number, issue: ExternalIssue): Promise<void> {
    const connectionId = session.client.connectionId;
    const id = JSON.stringify([session.client.baseUrl, timesheetId]);
    const key = JSON.stringify([connectionId, id]);
    if (!this.pending.has(key)) {
      this.pending.set(key, {
        id, connectionId, kimaiUrl: session.client.baseUrl,
        destination: timeSyncDestination(session.config), timesheetId,
        issueId: issue.id, issueUrl: issue.webUrl, status: "watching", nextAttemptAt: 0, error: null
      });
    }
    return this.serial(() => this.persistTracked(connectionId));
  }

  drain(session: TimeSyncSession, now = Date.now()): Promise<TimeSyncJob[]> {
    return this.serial(async () => {
      const connectionId = session.client.connectionId;
      await this.persistTracked(connectionId);
      const jobs = await this.repository.read(connectionId);
      const save = () => this.repository.write(connectionId, jobs);
      for (const job of jobs) {
        if (job.status === "sending") {
          job.status = "uncertain";
          await save();
        }
        if (job.status !== "watching" || !matchesTimeSyncSession(job, session) ||
          job.nextAttemptAt > now || job.timesheetId === session.runningTimerId || !session.isCurrent()) continue;
        let entry: KimaiTimesheetEntry;
        try {
          entry = await this.getTimesheet(session.client, job.timesheetId);
        } catch {
          job.error = "read";
          job.nextAttemptAt = now + 60_000;
          await save();
          continue;
        }
        if (!session.isCurrent()) break;
        // A running timesheet may report a duration. Never export it yet.
        if (entry.end === null) continue;
        const seconds = getRecordedDurationSeconds(entry);
        if (seconds === null) {
          job.error = "read";
          job.nextAttemptAt = now + 60_000;
          await save();
          continue;
        }
        job.error = null;
        // Both existing providers skip durations shorter than one minute.
        if (seconds < 60) {
          job.status = "done";
          await save();
          continue;
        }
        job.status = "sending";
        await save(); // Failure here must prevent the external side effect.
        if (!session.isCurrent()) {
          job.status = "watching";
          await save();
          break;
        }
        try {
          await session.send(job, seconds);
          job.status = "done";
        } catch (error) {
          const rejected = error instanceof SpentTimeRejectedError;
          job.status = rejected ? "watching" : "uncertain";
          job.error = rejected ? "rejected" : null;
          job.nextAttemptAt = now + 60_000;
        }
        // If this save fails, disk still says sending: next run requires review.
        await save();
      }
      return jobs;
    });
  }

  resolve(session: TimeSyncSession, id: string, action: "recorded" | "retry"): Promise<void> {
    return this.serial(async () => {
      const jobs = await this.repository.read(session.client.connectionId);
      const job = jobs.find((candidate) => candidate.id === id);
      if (!job || job.status !== "uncertain" || !matchesTimeSyncSession(job, session)) return;
      job.status = action === "recorded" ? "done" : "watching";
      job.error = null;
      job.nextAttemptAt = 0;
      await this.repository.write(session.client.connectionId, jobs);
    });
  }
}
