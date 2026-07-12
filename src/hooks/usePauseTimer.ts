import { useState, useCallback, useEffect, useRef } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { KimaiClient } from "../api/kimaiClient";
import { stopTimesheet, startTimesheet } from "../api/timesheetApi";
import { serializeKimaiTags } from "../api/tagUtils";
import {
  loadPausedTimers,
  addPausedTimer,
  removePausedTimer,
  removeResumedTimer,
  type PausedTimerData,
} from "../api/pauseStore";
import type { ActiveTimer } from "../types";
import { invalidateTimesheets } from "./invalidateTimesheets";

interface UsePauseTimerResult {
  pausedTimers: PausedTimerData[];
  hasPausedTimers: boolean;
  pauseTimer: () => void;
  resumeTimer: (id: string) => void;
  discardPausedTimer: (id: string) => void;
  stopActiveTimer: () => void;
  isPausing: boolean;
  resumingId: string | null;
  discardingId: string | null;
  isStoppingActive: boolean;
  pauseError: string | null;
  dismissPauseError: () => void;
}

export function usePauseTimer(
  client: KimaiClient | null,
  timer: ActiveTimer | null,
  connectionId: string,
): UsePauseTimerResult {
  const qc = useQueryClient();
  const [pausedTimers, setPausedTimers] = useState<PausedTimerData[]>([]);
  const [pauseError, setPauseError] = useState<string | null>(null);
  const [resumingId, setResumingId] = useState<string | null>(null);
  const [discardingId, setDiscardingId] = useState<string | null>(null);
  const timerRef = useRef(timer);
  timerRef.current = timer;
  const stopActiveInFlightRef = useRef<string | null>(null);
  const sessionScope = client?.cacheScope ?? `connection:${connectionId}`;
  const sessionScopeRef = useRef(sessionScope);
  sessionScopeRef.current = sessionScope;

  useEffect(() => {
    const scope = sessionScope;
    setPausedTimers([]);
    setPauseError(null);
    setResumingId(null);
    setDiscardingId(null);
    loadPausedTimers().then((all) => {
      if (sessionScopeRef.current !== scope) return;
      // Different-connection items stay in the store; we only surface ours.
      setPausedTimers(all.filter((t) => t.connectionId === connectionId));
    });
  }, [connectionId, sessionScope]);

  const invalidate = useCallback(() => {
    invalidateTimesheets(qc);
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
    }) => {
      const data: PausedTimerData = {
        id: crypto.randomUUID(),
        connectionId: operationConnectionId,
        lastTimesheetId: activeTimer.id,
        projectId: activeTimer.projectId,
        activityId: activeTimer.activityId,
        project: activeTimer.project,
        projectColor: activeTimer.projectColor,
        activityColor: activeTimer.activityColor,
        customerColor: activeTimer.customerColor,
        activity: activeTimer.activity,
        description: activeTimer.description,
        tags: activeTimer.tags,
        pausedAt: new Date().toISOString(),
      };
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
      invalidate();
    },
    onError: (err: Error, { scope }) => {
      if (sessionScopeRef.current !== scope) return;
      setPauseError(err.message);
    },
  });

  // Resume a specific paused timer; auto-pause running timer if any (swap)
  const resumeMut = useMutation({
    mutationFn: async ({
      target,
      currentTimer,
      operationClient,
      operationConnectionId,
      scope,
    }: {
      target: PausedTimerData;
      currentTimer: ActiveTimer | null;
      operationClient: KimaiClient;
      operationConnectionId: string;
      scope: string;
    }) => {
      // Auto-pause the running timer first (swap)
      if (currentTimer) {
        const swapData: PausedTimerData = {
          id: crypto.randomUUID(),
          connectionId: operationConnectionId,
          lastTimesheetId: currentTimer.id,
          projectId: currentTimer.projectId,
          activityId: currentTimer.activityId,
          project: currentTimer.project,
          projectColor: currentTimer.projectColor,
          activityColor: currentTimer.activityColor,
          customerColor: currentTimer.customerColor,
          activity: currentTimer.activity,
          description: currentTimer.description,
          tags: currentTimer.tags,
          pausedAt: new Date().toISOString(),
        };
        await addPausedTimer(swapData);
        try {
          await stopTimesheet(operationClient, currentTimer.id);
        } catch (error) {
          await removePausedTimer(swapData.id).catch(() => undefined);
          throw error;
        }
      }

      // Start the target paused timer
      await startTimesheet(operationClient, {
        project: target.projectId,
        activity: target.activityId,
        description: target.description || undefined,
        tags:
          target.tags.length > 0 ? serializeKimaiTags(target.tags) : undefined,
      });

      // Server success is authoritative. Hide the resumed item immediately and
      // retry a failed local cleanup instead of offering a duplicate resume.
      const updated = await removeResumedTimer(target.id);
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
      setResumingId(null);
      invalidate();
    },
    onError: (err: Error, { scope }) => {
      if (sessionScopeRef.current !== scope) return;
      setPauseError(err.message);
      setResumingId(null);
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
      invalidate();
    },
    onError: (err: Error, { scope }) => {
      if (sessionScopeRef.current !== scope) return;
      setPauseError(err.message);
      setDiscardingId(null);
    },
  });

  // Stop only the active timer — does not touch paused timers
  const stopActiveMut = useMutation({
    mutationFn: async ({
      timerId,
      operationClient,
      scope,
    }: {
      timerId: number;
      operationClient: KimaiClient;
      scope: string;
    }) => {
      await stopTimesheet(operationClient, timerId);
      return scope;
    },
    onSuccess: (scope) => {
      if (stopActiveInFlightRef.current === scope) {
        stopActiveInFlightRef.current = null;
      }
      if (sessionScopeRef.current !== scope) return;
      setPauseError(null);
      invalidate();
    },
    onError: (err: Error, { scope }) => {
      if (stopActiveInFlightRef.current === scope) {
        stopActiveInFlightRef.current = null;
      }
      if (sessionScopeRef.current !== scope) return;
      setPauseError(err.message);
    },
  });

  const isPausingCurrentSession =
    pauseMut.isPending && pauseMut.variables?.scope === sessionScope;
  const isResumingCurrentSession =
    resumeMut.isPending && resumeMut.variables?.scope === sessionScope;
  const isDiscardingCurrentSession =
    discardMut.isPending && discardMut.variables?.scope === sessionScope;
  const isStoppingCurrentSession =
    stopActiveMut.isPending && stopActiveMut.variables?.scope === sessionScope;

  const pauseTimer = useCallback(() => {
    if (!client || !timer || isPausingCurrentSession) return;
    setPauseError(null);
    pauseMut.mutate({
      activeTimer: timer,
      operationClient: client,
      operationConnectionId: connectionId,
      scope: sessionScope,
    });
  }, [client, timer, isPausingCurrentSession, pauseMut, connectionId, sessionScope]);

  const resumeTimer = useCallback(
    (id: string) => {
      if (!client || isResumingCurrentSession) return;
      const target = pausedTimers.find((t) => t.id === id);
      if (!target) return;
      setPauseError(null);
      setResumingId(target.id);
      resumeMut.mutate({
        target,
        currentTimer: timerRef.current,
        operationClient: client,
        operationConnectionId: connectionId,
        scope: sessionScope,
      });
    },
    [
      client,
      isResumingCurrentSession,
      pausedTimers,
      resumeMut,
      connectionId,
      sessionScope,
    ],
  );

  const discardPausedTimer = useCallback(
    (id: string) => {
      if (isDiscardingCurrentSession) return;
      setPauseError(null);
      setDiscardingId(id);
      discardMut.mutate({
        id,
        operationConnectionId: connectionId,
        scope: sessionScope,
      });
    },
    [discardMut, isDiscardingCurrentSession, connectionId, sessionScope],
  );

  const stopActiveTimer = useCallback(() => {
    if (
      !timer ||
      isStoppingCurrentSession ||
      stopActiveInFlightRef.current === sessionScope
    ) return;
    if (!client) return;
    setPauseError(null);
    stopActiveInFlightRef.current = sessionScope;
    stopActiveMut.mutate({
      timerId: timer.id,
      operationClient: client,
      scope: sessionScope,
    });
  }, [client, timer, isStoppingCurrentSession, stopActiveMut, sessionScope]);

  const dismissPauseError = useCallback(() => setPauseError(null), []);

  return {
    pausedTimers,
    hasPausedTimers: pausedTimers.length > 0,
    pauseTimer,
    resumeTimer,
    discardPausedTimer,
    stopActiveTimer,
    isPausing: isPausingCurrentSession,
    resumingId,
    discardingId,
    isStoppingActive: isStoppingCurrentSession,
    pauseError,
    dismissPauseError,
  };
}
