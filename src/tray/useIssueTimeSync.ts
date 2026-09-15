import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { KimaiClient } from "../api/kimaiClient";
import { getTimesheet } from "../api/timesheetApi";
import { createIssueProvider } from "../integrations/issues/issueProvider";
import type { ExternalIssue, IssueIntegrationSettings } from "../integrations/issues/types";
import {
  IssueTimeSyncQueue,
  matchesTimeSyncSession,
  type TimeSyncJob,
  type TimeSyncSession,
} from "../integrations/issues/issueTimeSyncQueue";
import { issueTimeSyncRepository } from "../integrations/issues/issueTimeSyncStore";
import { issueTimeSyncTarget } from "../integrations/issues/issueTimeSyncTarget";
import { logger } from "../utils/logger";

const queue = new IssueTimeSyncQueue(issueTimeSyncRepository, getTimesheet);
interface Options {
  client: KimaiClient | null;
  config: IssueIntegrationSettings;
  token: string | null;
  timerId?: number;
}

export function useIssueTimeSync({ client, config, token, timerId }: Options) {
  const [jobs, setJobs] = useState<TimeSyncJob[]>([]);
  const [storageError, setStorageError] = useState(false);
  const [resolving, setResolving] = useState(false);
  const current = useRef<TimeSyncSession | null>(null);
  const session = useMemo<TimeSyncSession | null>(() => {
    if (!client?.connectionId || !config.enabled || !config.syncTime || !token) return null;
    const provider = createIssueProvider(config, token, client.connectionId);
    if (!provider.addSpentTime) return null;
    const value: TimeSyncSession = {
      client, config, runningTimerId: timerId,
      isCurrent: () => current.current === value,
      send: async (job, seconds) => {
        const target = issueTimeSyncTarget(config, job.issueUrl, job.issueId);
        const destination = createIssueProvider({ ...config, projectPathOrRepo: target }, token, client.connectionId);
        await destination.addSpentTime!(job.issueId, seconds);
      },
    };
    return value;
  }, [client, config, token, timerId]);
  current.current = session;

  const flush = useCallback(async () => {
    if (!session) return;
    try {
      const result = await queue.drain(session);
      if (current.current !== session) return;
      setJobs(result);
      setStorageError(false);
    } catch {
      if (current.current === session) setStorageError(true);
      logger.error("Failed to persist issue time synchronization");
    }
  }, [session]);

  const track = useCallback(async (id: number, issue: ExternalIssue) => {
    if (!session) return;
    try {
      await queue.track(session, id, issue);
      await flush();
    } catch {
      if (current.current === session) setStorageError(true);
      logger.error("Failed to persist issue time synchronization");
    }
  }, [session, flush]);

  useEffect(() => {
    setJobs([]);
    setStorageError(false);
    void flush();
    const timer = window.setInterval(() => { void flush(); }, 60_000);
    const retry = () => { void flush(); };
    window.addEventListener("online", retry);
    window.addEventListener("focus", retry);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("online", retry);
      window.removeEventListener("focus", retry);
      current.current = null;
    };
  }, [flush]);
  // Effect cleanup clears the previous session, so install the new identity
  // before the asynchronous queue worker gets its turn.
  useEffect(() => { current.current = session; }, [session]);

  const resolve = useCallback(async (id: string, action: "recorded" | "retry") => {
    if (!session) return;
    setResolving(true);
    try {
      await queue.resolve(session, id, action);
      await flush();
    } catch {
      setStorageError(true);
    } finally {
      setResolving(false);
    }
  }, [session, flush]);

  const problems = session ? jobs.filter((job) => job.status !== "done" &&
    (job.status === "uncertain" || job.error || !matchesTimeSyncSession(job, session))) : [];
  return { track, flush, resolve, resolving, storageError, problems, session };
}
