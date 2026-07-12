import { useCallback, useEffect, useRef, useState } from "react";
import { getIdleSeconds } from "../api/idleApi";

export type IdleState = "active" | "idle" | "returned" | "handled";

export interface UseIdleDetectionResult {
  idleState: IdleState;
  idleStartedAt: Date | null;
  idleDurationSeconds: number;
  dismissIdle: () => void;
}

const POLL_INTERVAL_MS = 10_000;

export function useIdleDetection(
  enabled: boolean,
  thresholdMinutes: number,
  hasActiveTimer: boolean,
): UseIdleDetectionResult {
  const [idleState, setIdleState] = useState<IdleState>("active");
  const [idleDurationSeconds, setIdleDurationSeconds] = useState(0);

  const idleStartRef = useRef<Date | null>(null);
  const lastHandledRef = useRef<number>(0);
  const idleStateRef = useRef<IdleState>("active");

  const updateIdleState = useCallback((state: IdleState) => {
    idleStateRef.current = state;
    setIdleState(state);
  }, []);

  const dismissIdle = useCallback(() => {
    if (idleStartRef.current) {
      lastHandledRef.current = idleStartRef.current.getTime();
    }
    updateIdleState("handled");
  }, [updateIdleState]);

  useEffect(() => {
    if (!enabled || !hasActiveTimer) {
      updateIdleState("active");
      idleStartRef.current = null;
      return;
    }

    const thresholdSec = thresholdMinutes * 60;
    let cancelled = false;
    let timeoutId: ReturnType<typeof setTimeout> | undefined;

    const poll = async () => {
      try {
        const secs = await getIdleSeconds();
        if (cancelled) return;
        const isIdle = secs >= thresholdSec;
        const previousState = idleStateRef.current;

        if (isIdle) {
          if (previousState === "active") {
            idleStartRef.current = new Date(Date.now() - secs * 1000);
            setIdleDurationSeconds(secs);
            updateIdleState("idle");
          } else if (previousState === "idle") {
            setIdleDurationSeconds(secs);
          }
          return;
        }

        // User returned (not idle anymore)
        if (previousState === "idle") {
          const start = idleStartRef.current;
          if (start && start.getTime() !== lastHandledRef.current) {
            setIdleDurationSeconds(
              Math.round((Date.now() - start.getTime()) / 1000),
            );
            updateIdleState("returned");
            return;
          }
          idleStartRef.current = null;
          updateIdleState("active");
          return;
        }

        if (previousState === "handled") {
          idleStartRef.current = null;
          updateIdleState("active");
        }
      } catch {
        // Idle detection unavailable on this platform
      } finally {
        if (!cancelled) {
          timeoutId = setTimeout(poll, POLL_INTERVAL_MS);
        }
      }
    };

    void poll();
    return () => {
      cancelled = true;
      if (timeoutId !== undefined) clearTimeout(timeoutId);
    };
  }, [enabled, thresholdMinutes, hasActiveTimer, updateIdleState]);

  return {
    idleState,
    idleStartedAt: idleStartRef.current,
    idleDurationSeconds,
    dismissIdle,
  };
}
