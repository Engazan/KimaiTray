import { useState, useCallback, useEffect, useRef } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { KimaiClient } from "../api/kimaiClient";
import { stopTimesheet, startTimesheet } from "../api/timesheetApi";
import { serializeKimaiTags } from "../api/tagUtils";
import {
  loadPausedTimers,
  addPausedTimer,
  removePausedTimer,
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

  useEffect(() => {
    loadPausedTimers().then((all) => {
      // Different-connection items stay in the store; we only surface ours.
      setPausedTimers(all.filter((t) => t.connectionId === connectionId));
    });
  }, [connectionId]);

  const invalidate = useCallback(() => {
    invalidateTimesheets(qc);
  }, [qc]);

  // Pause the currently active timer → add to paused array
  const pauseMut = useMutation({
    mutationFn: async (activeTimer: ActiveTimer) => {
      await stopTimesheet(client!, activeTimer.id);
      const data: PausedTimerData = {
        id: crypto.randomUUID(),
        connectionId,
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
      const updated = await addPausedTimer(data);
      return updated.filter((t) => t.connectionId === connectionId);
    },
    onSuccess: (filtered) => {
      setPausedTimers(filtered);
      setPauseError(null);
      invalidate();
    },
    onError: (err: Error) => {
      setPauseError(err.message);
    },
  });

  // Resume a specific paused timer; auto-pause running timer if any (swap)
  const resumeMut = useMutation({
    mutationFn: async (target: PausedTimerData) => {
      setResumingId(target.id);
      const currentTimer = timerRef.current;

      // Auto-pause the running timer first (swap)
      if (currentTimer) {
        await stopTimesheet(client!, currentTimer.id);
        const swapData: PausedTimerData = {
          id: crypto.randomUUID(),
          connectionId,
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
      }

      // Start the target paused timer
      await startTimesheet(client!, {
        project: target.projectId,
        activity: target.activityId,
        description: target.description || undefined,
        tags:
          target.tags.length > 0 ? serializeKimaiTags(target.tags) : undefined,
      });

      // Remove the resumed timer from store
      const updated = await removePausedTimer(target.id);
      return updated.filter((t) => t.connectionId === connectionId);
    },
    onSuccess: (filtered) => {
      setPausedTimers(filtered);
      setPauseError(null);
      setResumingId(null);
      invalidate();
    },
    onError: (err: Error) => {
      setPauseError(err.message);
      setResumingId(null);
    },
  });

  // Discard a specific paused timer without resuming
  const discardMut = useMutation({
    mutationFn: async (id: string) => {
      setDiscardingId(id);
      const updated = await removePausedTimer(id);
      return updated.filter((t) => t.connectionId === connectionId);
    },
    onSuccess: (filtered) => {
      setPausedTimers(filtered);
      setPauseError(null);
      setDiscardingId(null);
      invalidate();
    },
    onError: (err: Error) => {
      setPauseError(err.message);
      setDiscardingId(null);
    },
  });

  // Stop only the active timer — does not touch paused timers
  const stopActiveMut = useMutation({
    mutationFn: async (timerId: number) => {
      await stopTimesheet(client!, timerId);
    },
    onSuccess: () => {
      setPauseError(null);
      invalidate();
    },
    onError: (err: Error) => {
      setPauseError(err.message);
    },
  });

  const pauseTimer = useCallback(() => {
    if (!client || !timer || pauseMut.isPending) return;
    setPauseError(null);
    pauseMut.mutate(timer);
  }, [client, timer, pauseMut]);

  const resumeTimer = useCallback(
    (id: string) => {
      if (!client || resumeMut.isPending) return;
      const target = pausedTimers.find((t) => t.id === id);
      if (!target) return;
      setPauseError(null);
      resumeMut.mutate(target);
    },
    [client, pausedTimers, resumeMut],
  );

  const discardPausedTimer = useCallback(
    (id: string) => {
      if (discardMut.isPending) return;
      setPauseError(null);
      discardMut.mutate(id);
    },
    [discardMut],
  );

  const stopActiveTimer = useCallback(() => {
    if (!timer || stopActiveMut.isPending) return;
    setPauseError(null);
    stopActiveMut.mutate(timer.id);
  }, [timer, stopActiveMut]);

  const dismissPauseError = useCallback(() => setPauseError(null), []);

  return {
    pausedTimers,
    hasPausedTimers: pausedTimers.length > 0,
    pauseTimer,
    resumeTimer,
    discardPausedTimer,
    stopActiveTimer,
    isPausing: pauseMut.isPending,
    resumingId,
    discardingId,
    isStoppingActive: stopActiveMut.isPending,
    pauseError,
    dismissPauseError,
  };
}
