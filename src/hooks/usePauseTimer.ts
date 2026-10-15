import { useState, useCallback, useEffect, useRef } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { KimaiClient } from "../api/kimaiClient";
import { stopTimesheet } from "../api/timesheetApi";
import {
  loadPausedTimers,
  addPausedTimer,
  removePausedTimer,
  removeResumedTimer,
  type PausedTimerData,
} from "../api/pauseStore";
import type { ActiveTimer } from "../types";
import { acquireTimerOperation } from "./timerOperationLock";
import { invalidateTimesheets } from "./invalidateTimesheets";
import { publishStartedTimesheet } from "./publishStartedTimesheet";
import { cancelRetry, retryStart, type RetryControl, type StartRetryState } from "./startRetry";
import { switchTask, TaskMetadataError } from "../services/timerService";
import {
  pickPluginMetadata,
  type PluginCustomInputDefinition,
} from "../plugins/customInputs";
import type { KimaiTimesheetEntry } from "../api/kimaiTypes";

const STOP_EXIT_ANIMATION_MS = 240;

function toPausedData(
  timer: ActiveTimer,
  connectionId: string,
  pluginCustomInputs: readonly PluginCustomInputDefinition[],
): PausedTimerData {
  return {
    id: crypto.randomUUID(),
    connectionId,
    lastTimesheetId: timer.id,
    projectId: timer.projectId,
    activityId: timer.activityId,
    project: timer.project,
    projectColor: timer.projectColor,
    activityColor: timer.activityColor,
    customerColor: timer.customerColor,
    activity: timer.activity,
    description: timer.description,
    tags: timer.tags,
    metadata: pickPluginMetadata(timer.metadata, pluginCustomInputs),
    pausedAt: new Date().toISOString(),
  };
}

interface UsePauseTimerResult {
  pausedTimers: PausedTimerData[];
  hasPausedTimers: boolean;
  /** Pause `target`, or the newest running timer when omitted. */
  pauseTimer: (target?: ActiveTimer) => void;
  resumeTimer: (id: string) => void;
  discardPausedTimer: (id: string) => void;
  /** Stop `target`, or the newest running timer when omitted. */
  stopActiveTimer: (target?: ActiveTimer) => void;
  /** Stop every running timer, e.g. when the screen locks. */
  stopAllActiveTimers: () => void;
  isPausing: boolean;
  pausingTimerId: number | null;
  stoppingTimerIds: readonly number[];
  resumingId: string | null;
  /** Set while a failed resume waits in the retry queue. */
  resumeRetry: StartRetryState | null;
  retryResumeNow: () => void;
  cancelResumeRetry: () => void;
  discardingId: string | null;
  isStoppingActive: boolean;
  pauseError: string | null;
  dismissPauseError: () => void;
}

export function usePauseTimer(
  client: KimaiClient | null,
  timer: ActiveTimer | null,
  connectionId: string,
  pluginCustomInputs: readonly PluginCustomInputDefinition[] = [],
  runningTimers: readonly ActiveTimer[] = timer ? [timer] : [],
  activeLimit = 1,
): UsePauseTimerResult {
  const qc = useQueryClient();
  const [pausedTimers, setPausedTimers] = useState<PausedTimerData[]>([]);
  const [pauseError, setPauseError] = useState<string | null>(null);
  const [resumingId, setResumingId] = useState<string | null>(null);
  const [resumeRetry, setResumeRetry] = useState<StartRetryState | null>(null);
  const resumeControlRef = useRef<RetryControl | null>(null);
  const [discardingId, setDiscardingId] = useState<string | null>(null);
  const [stoppingExitScope, setStoppingExitScope] = useState<string | null>(null);
  const [stoppingTimerIds, setStoppingTimerIds] = useState<readonly number[]>([]);
  const runningTimersRef = useRef(runningTimers);
  runningTimersRef.current = runningTimers;
  const activeLimitRef = useRef(activeLimit);
  activeLimitRef.current = activeLimit;
  const stopActiveInFlightRef = useRef<string | null>(null);
  const stopExitReleaseRef = useRef<(() => void) | null>(null);
  const stopExitTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sessionScope = client?.cacheScope ?? `connection:${connectionId}`;
  const sessionScopeRef = useRef(sessionScope);
  sessionScopeRef.current = sessionScope;

  useEffect(() => {
    setStoppingExitScope(null);
    return () => {
      // A queued resume belongs to the connection it was made for.
      cancelRetry(resumeControlRef.current);
      if (stopExitTimerRef.current) {
        clearTimeout(stopExitTimerRef.current);
        stopExitTimerRef.current = null;
        stopExitReleaseRef.current?.();
        stopExitReleaseRef.current = null;
      }
    };
  }, [sessionScope]);

  useEffect(() => {
    const scope = sessionScope;
    setPausedTimers([]);
    setPauseError(null);
    setResumingId(null);
    setResumeRetry(null);
    setDiscardingId(null);
    loadPausedTimers().then((all) => {
      if (sessionScopeRef.current !== scope) return;
      // Different-connection items stay in the store; we only surface ours.
      setPausedTimers(all.filter((t) => t.connectionId === connectionId));
    });
  }, [connectionId, sessionScope]);

  const invalidate = useCallback(() => {
    return invalidateTimesheets(qc);
  }, [qc]);

  // Pause the currently active timer → add to paused array
  const pauseMut = useMutation({
    mutationFn: async ({
      activeTimer,
      operationClient,
      operationConnectionId,
      scope,
    }: {
      activeTimer: ActiveTimer;
      operationClient: KimaiClient;
      operationConnectionId: string;
      scope: string;
      release: () => void;
    }) => {
      const data = toPausedData(activeTimer, operationConnectionId, pluginCustomInputs);
      // Persist recovery data before mutating Kimai. If the store write fails,
      // the active timer remains untouched.
      await addPausedTimer(data);
      try {
        await stopTimesheet(operationClient, activeTimer.id);
      } catch (error) {
        await removePausedTimer(data.id).catch(() => undefined);
        throw error;
      }
      const updated = await loadPausedTimers();
      return {
        scope,
        timers: updated.filter(
          (t) => t.connectionId === operationConnectionId,
        ),
      };
    },
    onSuccess: ({ scope, timers }) => {
      if (sessionScopeRef.current !== scope) return;
      setPausedTimers(timers);
      setPauseError(null);
      return invalidate();
    },
    onError: (err: Error, { scope }) => {
      if (sessionScopeRef.current !== scope) return;
      setPauseError(err.message);
    },
    onSettled: (_data, _error, { release }) => release(),
  });

  // Resume a specific paused timer; auto-pause running timer if any (swap)
  const resumeMut = useMutation({
    mutationFn: async ({
      target,
      toPause,
      operationClient,
      operationConnectionId,
      scope,
      control,
    }: {
      target: PausedTimerData;
      /** Running timers to pause first so the resumed one fits the limit. */
      toPause: readonly ActiveTimer[];
      operationClient: KimaiClient;
      operationConnectionId: string;
      scope: string;
      control: RetryControl;
      release: () => void;
    }) => {
      // Auto-pause running timers first (swap)
      for (const currentTimer of toPause) {
        const swapData = toPausedData(currentTimer, operationConnectionId, pluginCustomInputs);
        await addPausedTimer(swapData);
        try {
          await stopTimesheet(operationClient, currentTimer.id);
        } catch (error) {
          await removePausedTimer(swapData.id).catch(() => undefined);
          throw error;
        }
      }

      // Start the target paused timer. Swapped timers are already paused, so
      // nothing else is stopped; a failed start is queued like a new one.
      const firstAttemptAt = new Date();
      let entry: KimaiTimesheetEntry;
      let metadataError: Error | null = null;
      try {
        entry = await retryStart(
          (attempt) => switchTask(operationClient, {
            projectId: target.projectId,
            activityId: target.activityId,
            description: target.description || undefined,
            tags: target.tags,
            metadata: pickPluginMetadata(target.metadata, pluginCustomInputs),
            label: target.project,
          }, {
            adoptSince: attempt > 0 ? firstAttemptAt : undefined,
            activeLimit: Infinity,
          }),
          control,
          target.project,
          // Switching connections cancels the queue, so this stays in scope.
          (state) => {
            setResumeRetry(state);
            if (state.nextRetryAt === null) return;
            // Swapped timers already show up as paused while the resume waits.
            void loadPausedTimers().then((all) => {
              if (sessionScopeRef.current !== scope) return;
              setPausedTimers(all.filter((t) => t.connectionId === operationConnectionId));
            });
            void invalidate();
          },
        );
      } catch (error) {
        if (!(error instanceof TaskMetadataError)) throw error;
        entry = error.entry;
        metadataError = error;
      }

      // Server success is authoritative. Hide the resumed item immediately and
      // retry a failed local cleanup instead of offering a duplicate resume.
      const updated = await removeResumedTimer(target.id);
      return {
        scope,
        entry,
        timers: updated.filter(
          (t) => t.connectionId === operationConnectionId,
        ),
        metadataError,
      };
    },
    onSuccess: ({ scope, entry, timers, metadataError }) => {
      if (sessionScopeRef.current !== scope) return;
      publishStartedTimesheet(qc, scope, entry);
      setPausedTimers(timers);
      setPauseError(
        metadataError
          ? `Timer resumed, but custom field data could not be saved: ${metadataError.message}`
          : null,
      );
      setResumingId(null);
      return invalidate();
    },
    onError: (err: Error, { scope, operationConnectionId, control }) => {
      if (sessionScopeRef.current !== scope) return;
      // A resume the user withdrew from the queue has nothing to report.
      if (!control.cancelled) setPauseError(err.message);
      setResumingId(null);
      // Some running timers may have been paused before the failure.
      void loadPausedTimers().then((all) => {
        if (sessionScopeRef.current !== scope) return;
        setPausedTimers(all.filter((t) => t.connectionId === operationConnectionId));
      });
      return invalidate();
    },
    // The shared lock keeps a second resume from queueing until this settles.
    onSettled: (_data, _error, { release }) => {
      resumeControlRef.current = null;
      setResumeRetry(null);
      release();
    },
  });

  // Discard a specific paused timer without resuming
  const discardMut = useMutation({
    mutationFn: async ({
      id,
      operationConnectionId,
      scope,
    }: {
      id: string;
      operationConnectionId: string;
      scope: string;
      release: () => void;
    }) => {
      const updated = await removePausedTimer(id);
      return {
        scope,
        timers: updated.filter(
          (t) => t.connectionId === operationConnectionId,
        ),
      };
    },
    onSuccess: ({ scope, timers }) => {
      if (sessionScopeRef.current !== scope) return;
      setPausedTimers(timers);
      setPauseError(null);
      setDiscardingId(null);
      return invalidate();
    },
    onError: (err: Error, { scope }) => {
      if (sessionScopeRef.current !== scope) return;
      setPauseError(err.message);
      setDiscardingId(null);
    },
    onSettled: (_data, _error, { release }) => release(),
  });

  // Stop only the active timer — does not touch paused timers
  const stopActiveMut = useMutation({
    mutationFn: async ({
      timerIds,
      operationClient,
      scope,
    }: {
      timerIds: readonly number[];
      operationClient: KimaiClient;
      scope: string;
      release: () => void;
    }) => {
      for (const timerId of timerIds) {
        await stopTimesheet(operationClient, timerId);
      }
      return { scope, timerIds };
    },
    onSuccess: ({ scope, timerIds }, { release }) => {
      if (sessionScopeRef.current !== scope) {
        release();
        if (stopActiveInFlightRef.current === scope) {
          stopActiveInFlightRef.current = null;
        }
        return;
      }
      stopExitReleaseRef.current = release;
      setPauseError(null);
      setStoppingExitScope(scope);
      stopExitTimerRef.current = setTimeout(() => {
        stopExitTimerRef.current = null;

        // Remove the stopped entry at the end of the exit animation so a
        // quick API response cannot cut the animation short or make the card
        // briefly reappear while the active-timesheets query refetches.
        qc.setQueriesData<KimaiTimesheetEntry[]>(
          {
            predicate: (query) => query.queryKey[0] === "active-timesheets",
          },
          (entries) => entries?.filter((entry) => !timerIds.includes(entry.id)),
        );
        if (stopActiveInFlightRef.current === scope) {
          stopActiveInFlightRef.current = null;
        }
        setStoppingExitScope(null);
        setStoppingTimerIds([]);
        void invalidate();
        release();
        stopExitReleaseRef.current = null;
      }, STOP_EXIT_ANIMATION_MS);
    },
    onError: (err: Error, { scope, release }) => {
      release();
      if (stopActiveInFlightRef.current === scope) {
        stopActiveInFlightRef.current = null;
      }
      setStoppingExitScope(null);
      setStoppingTimerIds([]);
      if (sessionScopeRef.current !== scope) return;
      setPauseError(err.message);
      // Earlier timers in a multi-stop may already have stopped.
      return invalidate();
    },
  });

  const isPausingCurrentSession =
    pauseMut.isPending && pauseMut.variables?.scope === sessionScope;
  const isResumingCurrentSession =
    resumeMut.isPending && resumeMut.variables?.scope === sessionScope;
  const isDiscardingCurrentSession =
    discardMut.isPending && discardMut.variables?.scope === sessionScope;
  const isStoppingCurrentSession =
    (stopActiveMut.isPending && stopActiveMut.variables?.scope === sessionScope) ||
    stoppingExitScope === sessionScope;

  const pauseTimer = useCallback((target?: ActiveTimer) => {
    const activeTimer = target ?? timer;
    if (!client || !activeTimer || isPausingCurrentSession) return;
    const release = acquireTimerOperation(qc, sessionScope);
    if (!release) return;
    setPauseError(null);
    pauseMut.mutate({
      activeTimer,
      operationClient: client,
      operationConnectionId: connectionId,
      scope: sessionScope,
      release,
    });
  }, [client, timer, isPausingCurrentSession, pauseMut, connectionId, sessionScope, qc]);

  const resumeTimer = useCallback(
    (id: string) => {
      if (!client || isResumingCurrentSession) return;
      const target = pausedTimers.find((t) => t.id === id);
      if (!target) return;
      const release = acquireTimerOperation(qc, sessionScope);
      if (!release) return;
      setPauseError(null);
      setResumingId(target.id);
      // Oldest first, keeping room for the resumed timer under the limit.
      const running = runningTimersRef.current;
      const excess = running.length - Math.max(1, activeLimitRef.current) + 1;
      const control: RetryControl = { cancelled: false, wake: null };
      resumeControlRef.current = control;
      resumeMut.mutate({
        target,
        toPause: excess > 0 ? [...running].reverse().slice(0, excess) : [],
        operationClient: client,
        operationConnectionId: connectionId,
        scope: sessionScope,
        control,
        release,
      });
    },
    [
      client,
      isResumingCurrentSession,
      pausedTimers,
      resumeMut,
      qc,
      connectionId,
      sessionScope,
    ],
  );

  const discardPausedTimer = useCallback(
    (id: string) => {
      if (isDiscardingCurrentSession) return;
      const release = acquireTimerOperation(qc, sessionScope);
      if (!release) return;
      setPauseError(null);
      setDiscardingId(id);
      discardMut.mutate({
        id,
        operationConnectionId: connectionId,
        scope: sessionScope,
        release,
      });
    },
    [discardMut, isDiscardingCurrentSession, connectionId, sessionScope, qc],
  );

  const stopTimers = useCallback((timerIds: readonly number[]) => {
    if (
      timerIds.length === 0 ||
      isStoppingCurrentSession ||
      stopActiveInFlightRef.current === sessionScope
    ) return;
    if (!client) return;
    const release = acquireTimerOperation(qc, sessionScope);
    if (!release) return;
    setPauseError(null);
    setStoppingExitScope(sessionScope);
    setStoppingTimerIds(timerIds);
    stopActiveInFlightRef.current = sessionScope;
    stopActiveMut.mutate({
      timerIds,
      operationClient: client,
      scope: sessionScope,
      release,
    });
  }, [client, isStoppingCurrentSession, stopActiveMut, sessionScope, qc]);

  const stopActiveTimer = useCallback((target?: ActiveTimer) => {
    const activeTimer = target ?? timer;
    if (activeTimer) stopTimers([activeTimer.id]);
  }, [timer, stopTimers]);

  const stopAllActiveTimers = useCallback(() => {
    stopTimers(runningTimersRef.current.map((running) => running.id));
  }, [stopTimers]);

  const dismissPauseError = useCallback(() => setPauseError(null), []);
  const retryResumeNow = useCallback(() => resumeControlRef.current?.wake?.(), []);
  const cancelResumeRetry = useCallback(() => cancelRetry(resumeControlRef.current), []);

  return {
    pausedTimers,
    hasPausedTimers: pausedTimers.length > 0,
    pauseTimer,
    resumeTimer,
    discardPausedTimer,
    stopActiveTimer,
    stopAllActiveTimers,
    isPausing: isPausingCurrentSession,
    pausingTimerId: isPausingCurrentSession
      ? pauseMut.variables?.activeTimer.id ?? null
      : null,
    stoppingTimerIds: isStoppingCurrentSession ? stoppingTimerIds : [],
    resumingId,
    resumeRetry,
    retryResumeNow,
    cancelResumeRetry,
    discardingId,
    isStoppingActive: isStoppingCurrentSession,
    pauseError,
    dismissPauseError,
  };
}
