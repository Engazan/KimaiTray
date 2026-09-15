import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useQueryClient } from "@tanstack/react-query";
import { getCurrentWindow } from "@tauri-apps/api/window";
import type { KimaiClient } from "../api/kimaiClient";
import type { ActiveTimer, AppSettings } from "../types";
import { useIdleDetection } from "../hooks/useIdleDetection";
import { acquireTimerOperation } from "../hooks/timerOperationLock";
import { invalidateTimesheets } from "../hooks/invalidateTimesheets";
import { stopTimesheet } from "../api/timesheetApi";
import { stopTimerAtIdleBoundary } from "../services/timerService";
import type { IdleReminderAction } from "../api/reminderWindow";
import {
  hideFullscreenReminder,
  IDLE_REMINDER_ACTION_EVENT,
  showFullscreenReminder,
  updateFullscreenReminder,
} from "../api/reminderWindow";
import { logger } from "../utils/logger";

interface Options {
  client: KimaiClient | null;
  timer: ActiveTimer | null;
  idleSettings: Pick<AppSettings, "enableIdleDetection" | "idleThresholdMinutes" | "idleAction" | "showIdleNotification">;
  openNewTask: () => void;
  timerActionsDisabled: boolean;
}
export function useIdleTimerWorkflow({
  client,
  timer,
  idleSettings,
  openNewTask,
  timerActionsDisabled,
}: Options) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [idleProcessing, setIdleProcessing] = useState(false);
  const [idleActionError, setIdleActionError] = useState<string | null>(null);
  const idleReminderVisibleRef = useRef(false);
  const {
    idleState,
    idleStartedAt,
    idleDurationSeconds,
    dismissIdle,
  } = useIdleDetection(
    idleSettings.enableIdleDetection,
    idleSettings.idleThresholdMinutes,
    !!timer,
  );

  // Send notification when user returns from idle
  useEffect(() => {
    if (idleState !== "returned" || !idleSettings.showIdleNotification) return;
    import("@tauri-apps/plugin-notification").then(({ sendNotification }) => {
      const mins = Math.round(idleDurationSeconds / 60);
      return sendNotification({
        title: "KimaiTray",
        body: t("notifications.idleWhileTracking", { minutes: mins, project: timer?.project ?? "timer" }),
      });
    }).catch(() => { });
  }, [
    idleState,
    idleSettings.showIdleNotification,
    idleDurationSeconds,
    timer?.project,
    t,
  ]);
  // Auto-handle idle for non-"ask" actions
  const handledIdleStartRef = useRef<number | null>(null);
  useEffect(() => {
    if (idleState !== "returned" || idleSettings.idleAction === "ask") return;
    if (!client || !timer) return;
    const idleKey = idleStartedAt?.getTime() ?? 0;
    if (handledIdleStartRef.current === idleKey) return;
    const release = acquireTimerOperation(qc, client.cacheScope);
    if (!release) return;
    handledIdleStartRef.current = idleKey;

    const handle = async () => {
      setIdleProcessing(true);
      setIdleActionError(null);
      let succeeded = false;
      try {
        if (idleSettings.idleAction === "continue") {
          // Do nothing, just dismiss
        } else if (idleSettings.idleAction === "stop") {
          await stopTimesheet(client, timer.id);
          invalidateTimesheets(qc);
        } else if (idleSettings.idleAction === "discard" && idleStartedAt) {
          await stopTimerAtIdleBoundary(client, timer.id, idleStartedAt);
          invalidateTimesheets(qc);
        }
        succeeded = true;
      } catch {
        setIdleActionError(t("errors.failedToStopTimer"));
      } finally {
        release();
        setIdleProcessing(false);
      }
      if (succeeded) dismissIdle();
    };
    handle();
  }, [
    idleState,
    idleSettings.idleAction,
    timerActionsDisabled,
    client,
    timer,
    idleStartedAt,
    dismissIdle,
    qc,
    t,
  ]);

  useEffect(() => {
    if (idleState !== "returned") setIdleActionError(null);
  }, [idleState]);

  const handleIdleContinue = useCallback(() => {
    setIdleActionError(null);
    dismissIdle();
  }, [dismissIdle]);

  const stopAtIdleStart = useCallback(async () => {
    if (!client || !timer || !idleStartedAt) return false;
    const release = acquireTimerOperation(qc, client.cacheScope);
    if (!release) return false;
    setIdleProcessing(true);
    setIdleActionError(null);
    try {
      await stopTimerAtIdleBoundary(client, timer.id, idleStartedAt, true);
      invalidateTimesheets(qc);
    } catch {
      setIdleActionError(t("errors.failedToStopTimer"));
      return false;
    } finally {
      release();
      setIdleProcessing(false);
    }
    dismissIdle();
    return true;
  }, [client, timer, idleStartedAt, dismissIdle, qc, t]);

  const handleIdleStopAtStart = useCallback(async () => {
    await stopAtIdleStart();
  }, [stopAtIdleStart]);

  const handleIdleStopNow = useCallback(async () => {
    if (!client || !timer) return;
    const release = acquireTimerOperation(qc, client.cacheScope);
    if (!release) return;
    setIdleProcessing(true);
    setIdleActionError(null);
    let succeeded = false;
    try {
      await stopTimesheet(client, timer.id);
      invalidateTimesheets(qc);
      succeeded = true;
    } catch {
      setIdleActionError(t("errors.failedToStopTimer"));
    } finally {
      release();
      setIdleProcessing(false);
    }
    if (succeeded) dismissIdle();
  }, [client, timer, dismissIdle, qc, t]);

  const handleIdleStopAndNew = useCallback(async () => {
    if (await stopAtIdleStart()) openNewTask();
  }, [stopAtIdleStart, openNewTask]);

  useEffect(() => {
    const unlisten = getCurrentWindow().listen<{ action: IdleReminderAction }>(
      IDLE_REMINDER_ACTION_EVENT,
      ({ payload }) => {
        switch (payload.action) {
          case "continue":
            handleIdleContinue();
            break;
          case "stop-at-start":
            void handleIdleStopAtStart();
            break;
          case "stop-now":
            void handleIdleStopNow();
            break;
          case "stop-and-new":
            void handleIdleStopAndNew();
            break;
        }
      },
    );
    return () => {
      unlisten.then((cleanup) => cleanup());
    };
  }, [
    handleIdleContinue,
    handleIdleStopAtStart,
    handleIdleStopNow,
    handleIdleStopAndNew,
  ]);

  const showIdleDialog =
    !!client &&
    idleState === "returned" &&
    (idleSettings.idleAction === "ask" || !!idleActionError) &&
    timer &&
    idleStartedAt;

  useEffect(() => {
    if (!showIdleDialog || !timer || !idleStartedAt) {
      if (idleReminderVisibleRef.current) {
        idleReminderVisibleRef.current = false;
        void hideFullscreenReminder().catch((error) => {
          logger.error(`Failed to hide idle reminder: ${String(error)}`);
        });
      }
      return;
    }

    const payload = {
      kind: "idle" as const,
      test: false,
      idleStartedAtIso: idleStartedAt.toISOString(),
      idleDurationSeconds,
      project: timer.project,
      activity: timer.activity,
      processing: idleProcessing,
      error: idleActionError,
    };

    if (!idleReminderVisibleRef.current) {
      idleReminderVisibleRef.current = true;
      void showFullscreenReminder(payload)
        .then((shown) => {
          if (!shown) idleReminderVisibleRef.current = false;
        })
        .catch((error) => {
          idleReminderVisibleRef.current = false;
          logger.error(`Failed to show idle reminder: ${String(error)}`);
        });
    } else {
      void updateFullscreenReminder(payload).catch((error) => {
        logger.error(`Failed to update idle reminder: ${String(error)}`);
      });
    }
  }, [
    showIdleDialog,
    timer,
    idleStartedAt,
    idleDurationSeconds,
    idleProcessing,
    idleActionError,
  ]);

  return { idleProcessing };
}
