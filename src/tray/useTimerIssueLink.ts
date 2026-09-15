import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { KimaiClient } from "../api/kimaiClient";
import type { KimaiTimesheetEntry } from "../api/kimaiTypes";
import type { ActiveTimer } from "../types";
import type { ExternalIssue, IssueIntegrationSettings } from "../integrations/issues/types";
import type { StartTaskPayload } from "../services/timerService";
import { createIssueProvider } from "../integrations/issues/issueProvider";
import {
  readLinkedIssueSelectionForTimer,
  readLinkedIssueMap,
  storeLinkedIssueForTask,
  storeLinkedIssueForTimer,
  taskKeyOf,
} from "../integrations/issues/linkedIssueStore";
import { useIssueTimeSync } from "./useIssueTimeSync";

interface Options {
  client: KimaiClient | null;
  timer: ActiveTimer | null;
  activeConnectionId: string;
  issueIntegration: IssueIntegrationSettings;
  issueToken: string | null;
}

export function useTimerIssueLink({
  client,
  timer,
  activeConnectionId,
  issueIntegration,
  issueToken,
}: Options) {
  const submittedIssueRef = useRef<{
    payload: StartTaskPayload;
    issue: ExternalIssue | null;
    connectionId: string;
  } | null>(null);
  const pendingLinkedIssueRef = useRef<{
    timerId: number;
    issue: ExternalIssue;
    connectionId: string;
  } | null>(null);
  const [pendingLinkedIssueVersion, setPendingLinkedIssueVersion] = useState(0);
  const linkedIssueRef = useRef<{
    timerId: number;
    issue: ExternalIssue;
    connectionId: string;
  } | null>(null);
  const [linkedIssueLink, setLinkedIssueLink] = useState<{
    timerId: number;
    issue: ExternalIssue;
    connectionId: string;
  } | null>(null);
  const timeSync = useIssueTimeSync({ client, config: issueIntegration, token: issueToken, timerId: timer?.id });
  const { track, flush } = timeSync;

  const rememberSubmission = useCallback((payload: StartTaskPayload, issue: ExternalIssue | null) => {
    submittedIssueRef.current = { payload, issue, connectionId: activeConnectionId };
  }, [activeConnectionId]);

  const onTaskStarted = useCallback((entry: KimaiTimesheetEntry, payload: StartTaskPayload) => {
    const submitted = submittedIssueRef.current;
    submittedIssueRef.current = null;
    if (
      submitted?.payload === payload &&
      submitted.connectionId === activeConnectionId
    ) {
      storeLinkedIssueForTimer(
        submitted.connectionId,
        entry.id,
        submitted.issue,
      );
      if (!submitted.issue) return;
      void track(entry.id, submitted.issue);
      pendingLinkedIssueRef.current = {
        timerId: entry.id,
        issue: submitted.issue,
        connectionId: submitted.connectionId,
      };
      storeLinkedIssueForTask(
        submitted.connectionId,
        taskKeyOf(payload.projectId, payload.activityId, payload.description),
        submitted.issue,
      );
      setPendingLinkedIssueVersion((version) => version + 1);
    }
  }, [activeConnectionId, track]);
  const onTaskFailed = useCallback((_error: Error, payload: StartTaskPayload) => {
    if (submittedIssueRef.current?.payload === payload) submittedIssueRef.current = null;
  }, []);

  useEffect(() => {
    if (
      linkedIssueRef.current &&
      linkedIssueRef.current.connectionId !== activeConnectionId
    ) {
      linkedIssueRef.current = null;
      setLinkedIssueLink(null);
    }
    if (
      pendingLinkedIssueRef.current &&
      pendingLinkedIssueRef.current.connectionId !== activeConnectionId
    ) {
      pendingLinkedIssueRef.current = null;
    }
  }, [activeConnectionId]);

  useEffect(() => {
    if (!timer || linkedIssueRef.current?.timerId !== timer.id) {
      linkedIssueRef.current = null;
      setLinkedIssueLink(null);
    }
  }, [timer]);

  useEffect(() => {
    const pending = pendingLinkedIssueRef.current;
    if (
      !pending ||
      pending.connectionId !== activeConnectionId ||
      timer?.id !== pending.timerId
    ) {
      return;
    }
    pendingLinkedIssueRef.current = null;
    linkedIssueRef.current = pending;
    setLinkedIssueLink(pending);
  }, [timer?.id, activeConnectionId, pendingLinkedIssueVersion]);

  const timerIssueUrl = useMemo(() => {
    if (!issueIntegration.enabled || !issueIntegration.baseUrl || !timer?.description) return null;
    const base = issueIntegration.baseUrl.replace(/\/+$/, "");
    const urlRegex = new RegExp(`${base.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\S+`, "i");
    const match = timer.description.match(urlRegex);
    return match?.[0] ?? null;
  }, [issueIntegration.enabled, issueIntegration.baseUrl, timer?.description]);


  const estimateEnabled =
    issueIntegration.enabled &&
    issueIntegration.provider === "gitlab" &&
    (issueIntegration.showTimeEstimate ?? true);

  const linkedIssue =
    timer &&
      linkedIssueLink?.timerId === timer.id &&
      linkedIssueLink.connectionId === activeConnectionId
      ? linkedIssueLink.issue
      : null;

  // Persist the linked issue ↔ timer association so the estimate survives a
  // popup reload/remount or app restart, regardless of the auto-insert-URL
  // setting (we keep the issue's own web URL to refresh its stats later).
  // We never clear on a null timer: during a reload the timer is momentarily
  // null before the query resolves, and clearing would wipe the entry we want
  // to restore. A stale entry is harmless — the restore checks the timer id,
  // and Kimai never reuses timesheet ids.
  useEffect(() => {
    if (!timer || !linkedIssue) return;
    void track(timer.id, linkedIssue);
    storeLinkedIssueForTimer(activeConnectionId, timer.id, linkedIssue);
    // Also remember the issue by task identity so the estimate can be restored
    // when the same project+activity+note is later started from recents/favorites,
    // which don't embed the issue URL in their description.
    storeLinkedIssueForTask(
      activeConnectionId,
      taskKeyOf(timer.projectId, timer.activityId, timer.description),
      linkedIssue,
    );
  }, [timer, linkedIssue, activeConnectionId, track]);

  // When the current timer has no in-memory link (after a reload/restart or
  // when started from recents), restore it from localStorage and/or the issue
  // URL in the description, then refresh the time stats straight from GitLab.
  useEffect(() => {
    if ((!estimateEnabled && !issueIntegration.syncTime) || !issueIntegration.enabled || !timer || !issueToken) {
      return;
    }
    const currentLink = linkedIssueRef.current;
    if (
      linkedIssue ||
      (currentLink?.timerId === timer.id &&
        currentLink.connectionId === activeConnectionId)
    ) {
      return;
    }

    let storedIssue = readLinkedIssueSelectionForTimer(
      activeConnectionId,
      timer.id,
    );

    // A null selection is intentional: the user submitted the new-task form
    // without choosing an issue. Do not resurrect an older issue merely because
    // it used the same project and activity.
    if (storedIssue === null) return;

    // Fall back to the per-task association (project+activity+note). This is what
    // makes the badge appear for timers started from recents/favorites: they
    // have no stored timerId match and usually no issue URL in the description.
    if (!storedIssue) {
      const issueMap = readLinkedIssueMap(activeConnectionId);
      const byKey =
        issueMap[taskKeyOf(timer.projectId, timer.activityId, timer.description)] ??
        issueMap[taskKeyOf(timer.projectId, timer.activityId)];
      if (byKey) storedIssue = byKey;
    }

    // The saved association is enough to durably watch this timer. Do not
    // wait for optional issue-stat enrichment, which can fail or be cancelled
    // if the timer stops while the Git server is unavailable.
    if (storedIssue) void track(timer.id, storedIssue);

    const url = storedIssue?.webUrl ?? timerIssueUrl;
    const provider = createIssueProvider(
      issueIntegration,
      issueToken,
      activeConnectionId,
    );
    if (!url || !provider.fetchIssueByUrl) {
      if (storedIssue) {
        const restoredLink = {
          timerId: timer.id,
          issue: storedIssue,
          connectionId: activeConnectionId,
        };
        linkedIssueRef.current = restoredLink;
        setLinkedIssueLink(restoredLink);
      }
      return;
    }

    let cancelled = false;
    // If this issue has just been stopped, let its GitLab spent-time write
    // finish before reading the stats. Otherwise a fast click on Recents can
    // win the race and leave the badge at the old value (commonly 0 / X).
    const refreshedIssue = flush().then(() => provider.fetchIssueByUrl!(url));
    refreshedIssue
      .then((issue) => {
        if (!cancelled) {
          const restored = issue ?? storedIssue;
          if (!restored) return;
          const restoredLink = {
            timerId: timer.id,
            issue: restored,
            connectionId: activeConnectionId,
          };
          linkedIssueRef.current = restoredLink;
          setLinkedIssueLink(restoredLink);
        }
      })
      .catch(() => {
        if (cancelled || !storedIssue) return;
        const restoredLink = {
          timerId: timer.id,
          issue: storedIssue,
          connectionId: activeConnectionId,
        };
        linkedIssueRef.current = restoredLink;
        setLinkedIssueLink(restoredLink);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    linkedIssue,
    estimateEnabled,
    issueIntegration.syncTime,
    issueIntegration.enabled,
    timer?.id,
    timerIssueUrl,
    issueToken,
    activeConnectionId,
  ]);

  const showIssueEstimate =
    estimateEnabled && linkedIssue?.timeEstimate != null;

  return { rememberSubmission, onTaskStarted, onTaskFailed, timerIssueUrl, linkedIssue, showIssueEstimate, timeSync };
}
