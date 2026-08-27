import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { MouseEvent as ReactMouseEvent } from "react";
import { useTranslation } from "react-i18next";
import { useQueryClient } from "@tanstack/react-query";
import { getVersion } from "@tauri-apps/api/app";
import { getCurrentWindow, Window } from "@tauri-apps/api/window";
import HeaderStatus from "../components/HeaderStatus";
import ActiveTimerCard from "../components/ActiveTimerCard";
import PausedTimerCard from "../components/PausedTimerCard";
import EmptyTimerState from "../components/EmptyTimerState";
import RecentTasksList from "../components/RecentTasksList";
import FavoriteTasksList from "../components/FavoriteTasksList";
import PopupFooterActions from "../components/PopupFooterActions";
import { ErrorBanner, UpdateBanner } from "../components/TrayFeedback";
import {
  CollapsibleTraySection,
  FocusTabs,
} from "../components/TrayLayoutControls";
import NewTaskForm, {
  type NewTaskFormInitialValues,
} from "../components/NewTaskForm";
import CategoryModePanel from "../categorymode/CategoryModePanel";
import ApiErrorDialog from "../components/ApiErrorDialog";
import TodaySection from "../components/TodaySection";
import TimesheetEditDialog from "../components/TimesheetEditDialog";
import DetachedTitleBar from "../components/DetachedTitleBar";
import { useKimaiClient } from "../hooks/useKimaiClient";
import { useActiveTimer } from "../hooks/useActiveTimer";
import { useRecentTasks } from "../hooks/useRecentTasks";
import { useTodayTimesheets } from "../hooks/useTodayTimesheets";
import { useStartTask } from "../hooks/useStartTask";
import type { StartTaskPayload } from "../hooks/useStartTask";
import { useEditTimer } from "../hooks/useEditTimer";
import { useEditTimesheet } from "../hooks/useEditTimesheet";
import { usePauseTimer } from "../hooks/usePauseTimer";
import { useHiddenTasks } from "../hooks/useHiddenTasks";
import { useFavorites } from "../hooks/useFavorites";
import { useKimaiTags } from "../hooks/useKimaiTags";
import { useDeleteTimesheet } from "../hooks/useDeleteTimesheet";
import { useIdleDetection } from "../hooks/useIdleDetection";
import { useNoTimerReminder } from "../hooks/useNoTimerReminder";
import {
  openKimaiInBrowser as openConfiguredKimai,
  registerShortcuts,
  setAlwaysOnTop,
  setTrayIcon,
  setTrayTitle,
  setTrayTooltip,
  startTrayTicker,
  stopTrayTicker,
  updateTrayMenu,
} from "../api/trayApi";
import { formatAcceleratorForDisplay } from "../settings/Controls";
import { useAppearance } from "../hooks/useAppearance";
import { invalidateTimesheets } from "../hooks/invalidateTimesheets";
import { useLanguageSync } from "../hooks/useLanguageSync";
import { useUpdater } from "../hooks/useUpdater";
import { getTimesheet, updateTimesheet, stopTimesheet } from "../api/timesheetApi";
import type { RecentTask, FavoriteTask, TodayEntry } from "../types";
import type { ExternalIssue } from "../integrations/issues/types";
import { createIssueProvider } from "../integrations/issues/issueProvider";
import {
  readLinkedIssueSelectionForTimer,
  readLinkedIssueMap,
  storeLinkedIssueForTask,
  storeLinkedIssueForTimer,
  taskKeyOf,
} from "../integrations/issues/linkedIssueStore";
import { logger } from "../utils/logger";
import type { IdleReminderAction } from "../api/reminderWindow";
import {
  hideFullscreenReminder,
  IDLE_REMINDER_ACTION_EVENT,
  showFullscreenReminder,
  updateFullscreenReminder,
} from "../api/reminderWindow";
import { getRecordedDurationSeconds } from "../utils/timesheetDuration";
import { toKimaiLocal } from "../utils/time";
import {
  claimInstalledChangelog,
  rememberPendingChangelog,
} from "../api/changelog";
import { showChangelogWindow } from "../api/changelogWindow";
import {
  DESCRIPTION_INPUT_TARGET,
  getEnabledPluginCustomInputs,
  pickPluginMetadata,
} from "../plugins/customInputs";
import { subscribeToDeepLinks } from "../api/deepLink";
import {
  parseKimaiTrayDeepLink,
  resolveDeepLinkConnectionId,
  type KimaiTrayDeepLink,
} from "../api/deepLinkPayload";
import { separator, showContextMenu, type ContextMenuEntry } from "../components/contextMenu";

interface PendingDeepLink {
  id: number;
  request: KimaiTrayDeepLink;
}

export default function TrayPopup() {
  const { t, i18n } = useTranslation();
  const qc = useQueryClient();
  const [showNewTask, setShowNewTask] = useState(false);
  const [newTaskInitialValues, setNewTaskInitialValues] =
    useState<NewTaskFormInitialValues>();
  const [newTaskShortcutRequest, setNewTaskShortcutRequest] = useState(0);
  const [editNoteRequest, setEditNoteRequest] = useState(0);
  const [idleProcessing, setIdleProcessing] = useState(false);
  const [idleActionError, setIdleActionError] = useState<string | null>(null);
  const [focusTab, setFocusTab] = useState<"recent" | "today">("recent");
  const [recentCollapsed, setRecentCollapsed] = useState(false);
  const [todayCollapsed, setTodayCollapsed] = useState(false);
  const [editingEntry, setEditingEntry] = useState<TodayEntry | null>(null);
  const [deepLinkQueue, setDeepLinkQueue] = useState<PendingDeepLink[]>([]);
  const [deepLinkProcessing, setDeepLinkProcessing] = useState(false);
  const [deepLinkError, setDeepLinkError] = useState<string | null>(null);
  const deepLinkSequenceRef = useRef(0);
  const attemptedConnectionSwitchesRef = useRef(new Set<number>());
  const idleReminderVisibleRef = useRef(false);

  useAppearance();
  useLanguageSync();

  useEffect(() => {
    let cancelled = false;
    void getVersion()
      .then(async (version) => {
        if (cancelled) return;
        const changelog = claimInstalledChangelog(version);
        if (!changelog) return;
        try {
          const opened = await showChangelogWindow(changelog);
          if (!opened) rememberPendingChangelog(changelog);
        } catch (error) {
          rememberPendingChangelog(changelog);
          throw error;
        }
      })
      .catch((error) => {
        logger.error(`Failed to open installed changelog: ${String(error)}`);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const win = getCurrentWindow();
    const unlisten = win.listen("kimai://refresh", () => {
      invalidateTimesheets(qc);
    });
    return () => { unlisten.then((fn) => fn()); };
  }, [qc]);

  useEffect(() => {
    const win = getCurrentWindow();
    const unlisten = win.listen("kimai://new-task", () => {
      setNewTaskInitialValues(undefined);
      setNewTaskShortcutRequest((request) => request + 1);
      setShowNewTask(true);
    });
    return () => { unlisten.then((fn) => fn()); };
  }, []);

  useEffect(
    () =>
      subscribeToDeepLinks((url) => {
        try {
          const request = parseKimaiTrayDeepLink(url);
          setDeepLinkError(null);
          setShowNewTask(false);
          setNewTaskShortcutRequest(0);
          setDeepLinkQueue((current) => [
            ...current.slice(-19),
            { id: ++deepLinkSequenceRef.current, request },
          ]);
        } catch (error) {
          setDeepLinkError(
            error instanceof Error ? error.message : String(error),
          );
        }
      }),
    [],
  );

  const {
    client,
    settingsReady,
    isConfigured,
    refreshInterval,
    baseUrl,
    openKimaiInBrowser,
    idleSettings,
    timerReminderSettings,
    traySettings,
    shortcutSettings,
    featureFlags,
    pluginFlags,
    autoUpdate,
    popupLayout,
    colorMode,
    displayMode,
    connections,
    activeConnectionId,
    switchConnection,
    issueIntegration,
    issueToken,
  } = useKimaiClient();
  const pluginCustomInputs = useMemo(
    () => getEnabledPluginCustomInputs(pluginFlags),
    [pluginFlags],
  );
  const isDetached = displayMode === "detached";
  const [pinned, setPinned] = useState(false);

  useEffect(() => {
    if (!isDetached) setPinned(false);
  }, [isDetached]);

  const updater = useUpdater(autoUpdate);

  useEffect(() => {
    setRecentCollapsed(popupLayout === "timeline");
    setTodayCollapsed(popupLayout === "taskbar");
  }, [popupLayout]);

  useEffect(() => {
    const shortcutHint = shortcutSettings.shortcutTogglePopup
      ? `  ${formatAcceleratorForDisplay(shortcutSettings.shortcutTogglePopup)}`
      : "";
    updateTrayMenu({
      toggleLabel: t("common.showHide") + shortcutHint,
      settingsLabel: t("common.settings"),
      openKimaiLabel: t("common.openKimai"),
      refreshLabel: t("common.refresh"),
      quitLabel: t("common.quit"),
    });
  }, [i18n.language, t, shortcutSettings.shortcutTogglePopup]);
  const {
    timer,
    multipleActive,
    status,
    errorMessage,
  } = useActiveTimer(client, isConfigured, refreshInterval, settingsReady);

  useNoTimerReminder({
    enabled: timerReminderSettings.enabled,
    thresholdMinutes: timerReminderSettings.thresholdMinutes,
    presence: timer
      ? "running"
      : status === "connected"
        ? "stopped"
        : "unknown",
  });

  useEffect(() => {
    setEditNoteRequest(0);
  }, [timer?.id]);

  const {
    pausedTimers,
    hasPausedTimers,
    pauseTimer,
    resumeTimer,
    discardPausedTimer,
    stopActiveTimer,
    isPausing,
    resumingId,
    discardingId,
    isStoppingActive,
    pauseError,
    dismissPauseError,
  } = usePauseTimer(
    client,
    timer,
    activeConnectionId,
    pluginCustomInputs,
  );

  const activeKey = timer
    ? taskKeyOf(timer.projectId, timer.activityId, timer.description)
    : null;
  const { tasks, isLoading: tasksLoading } = useRecentTasks(
    client,
    isConfigured,
    activeKey,
  );

  const today = useTodayTimesheets(client, isConfigured, refreshInterval);
  const dailyGoal = featureFlags.featureDailyGoal
    ? {
        requiredMinutes: featureFlags.dailyGoalMinutes,
        fullMinutes: featureFlags.fullDailyGoalMinutes,
        isTimerRunning: !!timer,
      }
    : undefined;

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
  const issueTimeSyncsRef = useRef(new Map<string, Promise<void>>());
  const prevTimerIdRef = useRef<number | null>(null);

  const { startTask, startingKey, switchError, dismissError, isStarting } =
    useStartTask(
      client,
      (entry, payload) => {
        setShowNewTask(false);
        setNewTaskInitialValues(undefined);
        setNewTaskShortcutRequest(0);
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
      },
      (_error, payload) => {
        if (submittedIssueRef.current?.payload === payload) {
          submittedIssueRef.current = null;
        }
      },
    );
  const isStartBusy = isStarting || deepLinkProcessing;

  useEffect(() => {
    const pending = deepLinkQueue[0];
    if (!pending || deepLinkProcessing || isStarting) return;
    if (!settingsReady) return;

    const removePending = () => {
      attemptedConnectionSwitchesRef.current.delete(pending.id);
      setDeepLinkQueue((current) =>
        current[0]?.id === pending.id ? current.slice(1) : current,
      );
    };
    const failPending = (message: string) => {
      setDeepLinkError(message);
      removePending();
    };

    const requestedConnection = resolveDeepLinkConnectionId(
      pending.request,
      activeConnectionId,
    );
    if (requestedConnection && requestedConnection !== activeConnectionId) {
      if (!connections.some((connection) => connection.id === requestedConnection)) {
        failPending(`Deep-link connection "${requestedConnection}" does not exist`);
        return;
      }
      if (attemptedConnectionSwitchesRef.current.has(pending.id)) {
        failPending(`KimaiTray could not switch to connection "${requestedConnection}"`);
        return;
      }
      attemptedConnectionSwitchesRef.current.add(pending.id);
      setDeepLinkProcessing(true);
      void switchConnection(requestedConnection).finally(() => {
        setDeepLinkProcessing(false);
      });
      return;
    }

    if (!client || !isConfigured) {
      failPending("Configure the requested Kimai connection before using this deep link");
      return;
    }

    setDeepLinkProcessing(true);
    void (async () => {
      const request = pending.request;
      const metadata: Record<string, string> = {};
      const customInputValues: Record<string, string> = {};
      for (const [name, value] of Object.entries(request.customFields)) {
        const input = pluginCustomInputs.find(
          (candidate) =>
            candidate.metadataName === name || candidate.id === name,
        );
        if (!input) {
          // The "new" form is interactive: if a plugin field the deep link
          // targets isn't enabled for this connection (plugin off, or no such
          // input), just open the form without it instead of failing. The
          // "start" action commits directly, so a missing field is surfaced.
          if (request.action === "new") continue;
          throw new Error(
            `Custom plugin field "${name}" is not enabled for this connection`,
          );
        }
        metadata[input.metadataName] = value;
        customInputValues[input.id] = value;
      }

      let description = request.description;
      let linkedIssue: ExternalIssue | null = null;
      // The interactive "new" form only needs the issue URL, which a custom
      // plugin field (e.g. Creative Issue Link) already carries. Resolving the
      // issue through the Git integration is a best-effort enrichment there, so
      // a missing integration must not abort the whole deep link. The "start"
      // action commits a timer directly and still requires a resolved issue.
      if (request.issueUrl && issueIntegration.enabled && issueToken) {
        const provider = createIssueProvider(
          issueIntegration,
          issueToken,
          activeConnectionId,
        );
        if (!provider.fetchIssueByUrl) {
          throw new Error("The configured Git provider cannot load issue URLs");
        }
        linkedIssue = await provider.fetchIssueByUrl(request.issueUrl);
        if (!linkedIssue && request.action === "start") {
          throw new Error(
            "The issue URL does not match an accessible issue on the configured Git provider",
          );
        }

        if (issueIntegration.autoInsertUrl) {
          // Opening the interactive form must keep working when GitLab is
          // temporarily unreachable. Use the original, already validated deep
          // link URL when the optional issue enrichment could not be loaded.
          const issueWebUrl = linkedIssue?.webUrl ?? request.issueUrl;
          const target =
            issueIntegration.autoInsertUrlTarget ?? DESCRIPTION_INPUT_TARGET;
          const customTarget = pluginCustomInputs.find(
            (input) => input.id === target,
          );
          if (customTarget) {
            metadata[customTarget.metadataName] ??= issueWebUrl;
            customInputValues[customTarget.id] ??= issueWebUrl;
          } else if (!description?.includes(issueWebUrl)) {
            description = description?.trim()
              ? `${description.trim()}\n${issueWebUrl}`
              : issueWebUrl;
          }
        }
      }

      if (request.issueUrl && request.action === "start" && !linkedIssue) {
        throw new Error(
          "Enable and authenticate the Git issue integration for this connection",
        );
      }

      if (request.action === "new") {
        setNewTaskInitialValues({
          description,
          tags: request.tags,
          customInputValues,
          selectedIssue: linkedIssue,
        });
        setNewTaskShortcutRequest((current) => current + 1);
        setShowNewTask(true);
        return;
      }

      const payload: StartTaskPayload = {
        projectId: request.projectId,
        activityId: request.activityId,
        begin: request.begin,
        description,
        tags: request.tags,
        metadata: Object.keys(metadata).length > 0 ? metadata : undefined,
        label: request.label ?? `Project #${request.projectId}`,
      };
      submittedIssueRef.current = {
        payload,
        issue: linkedIssue,
        connectionId: activeConnectionId,
      };
      await startTask(payload, `deep-link:${pending.id}`);
    })()
      .catch((error) => {
        setDeepLinkError(error instanceof Error ? error.message : String(error));
      })
      .finally(() => {
        removePending();
        setDeepLinkProcessing(false);
      });
  }, [
    activeConnectionId,
    client,
    connections,
    deepLinkProcessing,
    deepLinkQueue,
    isConfigured,
    isStarting,
    issueIntegration,
    issueToken,
    pluginCustomInputs,
    settingsReady,
    startTask,
    switchConnection,
  ]);

  const pauseResumeTimerRef = useRef<(() => void) | null>(null);
  pauseResumeTimerRef.current = () => {
    if (timer) {
      pauseTimer();
      return;
    }
    const mostRecent = pausedTimers.reduce<(typeof pausedTimers)[number] | null>(
      (latest, paused) =>
        !latest || paused.pausedAt > latest.pausedAt ? paused : latest,
      null,
    );
    if (mostRecent) resumeTimer(mostRecent.id);
  };

  const continueLastTaskRef = useRef<(() => void) | null>(null);
  continueLastTaskRef.current = () => {
    const task = tasks[0];
    if (!task) return;
    void startTask(
      {
        projectId: task.projectId,
        activityId: task.activityId,
        description: task.description || undefined,
        tags: task.tags?.length ? task.tags : undefined,
        metadata: pickPluginMetadata(task.metadata, pluginCustomInputs),
        label: task.project,
      },
      task.key,
    );
  };

  const editActiveNoteRef = useRef<(() => void) | null>(null);
  editActiveNoteRef.current = () => {
    if (!timer) return;
    setShowNewTask(false);
    setNewTaskInitialValues(undefined);
    setNewTaskShortcutRequest(0);
    setEditNoteRequest((request) => request + 1);
  };

  const { editTimer, isSaving, saveError } = useEditTimer(client);
  const { editTimesheet: editCompletedTimesheet } = useEditTimesheet(client);
  const { hiddenKeys, hideTask, clearAll: clearHidden } = useHiddenTasks(activeConnectionId);
  const { favorites, addFavorite: addFav, removeFavorite: removeFav, isFavorite } = useFavorites(activeConnectionId, baseUrl);
  const tagSuggestions = useKimaiTags(client);
  const { deleteEntry, deletingId, deleteError: timesheetDeleteError, dismissError: dismissDeleteError } = useDeleteTimesheet(client);

  useEffect(() => {
    setEditingEntry(null);
  }, [activeConnectionId]);

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
    }).catch(() => {});
  }, [
    idleState,
    idleSettings.showIdleNotification,
    idleDurationSeconds,
    timer?.project,
    t,
  ]);

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
    const prevId = prevTimerIdRef.current;
    const previousLink = linkedIssueRef.current;
    const timerChanged =
      prevId != null && (timer == null || timer.id !== prevId);

    prevTimerIdRef.current = timer?.id ?? null;

    // A linked issue belongs to one concrete Kimai timesheet. Do not let an
    // in-memory issue snapshot from the previous timer suppress the refresh for
    // a timer just started from recents/favorites.
    if (
      timer == null ||
      (previousLink != null && previousLink.timerId !== timer.id)
    ) {
      linkedIssueRef.current = null;
      setLinkedIssueLink(null);
    }

    if (
      timerChanged &&
      previousLink?.timerId === prevId
    ) {
      const belongsToActiveConnection =
        previousLink.connectionId === activeConnectionId;

      if (
        belongsToActiveConnection &&
        issueIntegration.syncTime &&
        issueIntegration.enabled &&
        issueToken &&
        client
      ) {
        const provider = createIssueProvider(
          issueIntegration,
          issueToken,
          activeConnectionId,
        );
        if (provider.addSpentTime) {
          const syncKey = `${previousLink.connectionId}:${previousLink.issue.webUrl}`;
          const previousSync =
            issueTimeSyncsRef.current.get(syncKey) ?? Promise.resolve();
          const syncPromise = previousSync
            .then(() => getTimesheet(client, prevId))
            .then((entry) => {
              const durationSeconds = getRecordedDurationSeconds(entry);
              if (durationSeconds == null || durationSeconds <= 0) return;
              return provider.addSpentTime?.(
                previousLink.issue.id,
                durationSeconds,
              );
            })
            .catch(() => {
              logger.error("Failed to sync spent time to issue provider");
            });
          issueTimeSyncsRef.current.set(syncKey, syncPromise);
          void syncPromise.finally(() => {
            if (issueTimeSyncsRef.current.get(syncKey) === syncPromise) {
              issueTimeSyncsRef.current.delete(syncKey);
            }
          });
        }
      }
    }
  }, [
    timer,
    issueIntegration,
    issueToken,
    activeConnectionId,
    client,
  ]);

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

  // Global shortcut: toggle timer
  const stopActiveTimerRef = useRef(stopActiveTimer);
  stopActiveTimerRef.current = stopActiveTimer;
  const stopTimerOnScreensaverRef = useRef(
    idleSettings.stopTimerOnScreensaver,
  );
  stopTimerOnScreensaverRef.current = idleSettings.stopTimerOnScreensaver;
  const stopTimerOnScreenLockRef = useRef(idleSettings.stopTimerOnScreenLock);
  stopTimerOnScreenLockRef.current = idleSettings.stopTimerOnScreenLock;

  useEffect(() => {
    const win = getCurrentWindow();
    const unlisten = win.listen("kimai://toggle-timer", () => {
      stopActiveTimerRef.current();
    });
    return () => { unlisten.then((fn) => fn()); };
  }, []);

  useEffect(() => {
    const win = getCurrentWindow();
    const unlisten = win.listen("kimai://screensaver-started", () => {
      if (stopTimerOnScreensaverRef.current) {
        stopActiveTimerRef.current();
      }
    });
    return () => { unlisten.then((fn) => fn()); };
  }, []);

  useEffect(() => {
    const win = getCurrentWindow();
    const unlisten = win.listen("kimai://screen-locked", () => {
      if (stopTimerOnScreenLockRef.current) {
        stopActiveTimerRef.current();
      }
    });
    return () => { unlisten.then((fn) => fn()); };
  }, []);

  useEffect(() => {
    const win = getCurrentWindow();
    const unlisten = win.listen("kimai://pause-resume-timer", () => {
      pauseResumeTimerRef.current?.();
    });
    return () => { unlisten.then((fn) => fn()); };
  }, []);

  useEffect(() => {
    const win = getCurrentWindow();
    const unlisten = win.listen("kimai://continue-last-task", () => {
      continueLastTaskRef.current?.();
    });
    return () => { unlisten.then((fn) => fn()); };
  }, []);

  useEffect(() => {
    const win = getCurrentWindow();
    const unlisten = win.listen("kimai://edit-active-note", () => {
      editActiveNoteRef.current?.();
    });
    return () => { unlisten.then((fn) => fn()); };
  }, []);

  // Re-register global shortcuts when settings change
  useEffect(() => {
    registerShortcuts({
      togglePopup: shortcutSettings.shortcutTogglePopup,
      startStopTimer: shortcutSettings.shortcutStartStopTimer,
      newTask: shortcutSettings.shortcutNewTask,
      pauseResume: shortcutSettings.shortcutPauseResume,
      continueLastTask: shortcutSettings.shortcutContinueLastTask,
      editNote: shortcutSettings.shortcutEditNote,
      openKimai: shortcutSettings.shortcutOpenKimai,
      openSettings: shortcutSettings.shortcutOpenSettings,
    }).catch(() => {});
  }, [
    shortcutSettings.shortcutTogglePopup,
    shortcutSettings.shortcutStartStopTimer,
    shortcutSettings.shortcutNewTask,
    shortcutSettings.shortcutPauseResume,
    shortcutSettings.shortcutContinueLastTask,
    shortcutSettings.shortcutEditNote,
    shortcutSettings.shortcutOpenKimai,
    shortcutSettings.shortcutOpenSettings,
  ]);

  // Auto-handle idle for non-"ask" actions
  const handledIdleStartRef = useRef<number | null>(null);
  useEffect(() => {
    if (idleState !== "returned" || idleSettings.idleAction === "ask") return;
    if (!client || !timer) return;
    const idleKey = idleStartedAt?.getTime() ?? 0;
    if (handledIdleStartRef.current === idleKey) return;
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
          await updateTimesheet(client, timer.id, {
            end: toKimaiLocal(idleStartedAt),
          });
          invalidateTimesheets(qc);
        }
        succeeded = true;
      } catch {
        setIdleActionError(t("errors.failedToStopTimer"));
      } finally {
        setIdleProcessing(false);
      }
      if (succeeded) dismissIdle();
    };
    handle();
  }, [
    idleState,
    idleSettings.idleAction,
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

  const handleIdleStopAtStart = useCallback(async () => {
    if (!client || !timer || !idleStartedAt) return;
    setIdleProcessing(true);
    setIdleActionError(null);
    let succeeded = false;
    try {
      await updateTimesheet(client, timer.id, {
        end: toKimaiLocal(idleStartedAt),
      });
      invalidateTimesheets(qc);
      succeeded = true;
    } catch {
      // fallback: just stop now
      try {
        await stopTimesheet(client, timer.id);
        invalidateTimesheets(qc);
        succeeded = true;
      } catch {
        setIdleActionError(t("errors.failedToStopTimer"));
      }
    } finally {
      setIdleProcessing(false);
    }
    if (succeeded) dismissIdle();
  }, [client, timer, idleStartedAt, dismissIdle, qc, t]);

  const handleIdleStopNow = useCallback(async () => {
    if (!client || !timer) return;
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
      setIdleProcessing(false);
    }
    if (succeeded) dismissIdle();
  }, [client, timer, dismissIdle, qc, t]);

  const handleIdleStopAndNew = useCallback(async () => {
    if (!client || !timer || !idleStartedAt) return;
    setIdleProcessing(true);
    setIdleActionError(null);
    let succeeded = false;
    try {
      await updateTimesheet(client, timer.id, {
        end: toKimaiLocal(idleStartedAt),
      });
      invalidateTimesheets(qc);
      succeeded = true;
    } catch {
      try {
        await stopTimesheet(client, timer.id);
        invalidateTimesheets(qc);
        succeeded = true;
      } catch {
        setIdleActionError(t("errors.failedToStopTimer"));
      }
    } finally {
      setIdleProcessing(false);
    }
    if (succeeded) {
      dismissIdle();
      setNewTaskInitialValues(undefined);
      setNewTaskShortcutRequest(0);
      setShowNewTask(true);
    }
  }, [client, timer, idleStartedAt, dismissIdle, qc, t]);

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

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (showNewTask) {
          setShowNewTask(false);
          setNewTaskShortcutRequest(0);
        } else if (!isDetached) {
          getCurrentWindow().hide();
        }
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [showNewTask, isDetached]);

  // Update tray icon state
  const hasTimer = !!timer;
  useEffect(() => {
    if (status === "error" || status === "offline") {
      setTrayIcon("error");
    } else if (timer) {
      setTrayIcon("running");
    } else if (hasPausedTimers) {
      setTrayIcon("paused");
    } else {
      setTrayIcon("idle");
    }
  }, [status, hasTimer, hasPausedTimers, timer]);

  // Update tray tooltip and menu bar title.
  // The per-second tick runs in a native Rust thread (start/stopTrayTicker)
  // so macOS cannot throttle it like it does with webview JS timers.
  useEffect(() => {
    if (!timer && hasPausedTimers) {
      stopTrayTicker();
      const first = pausedTimers[0];
      const suffix = pausedTimers.length > 1 ? ` (+${pausedTimers.length - 1})` : "";
      setTrayTooltip(`KimaiTray — ${t("pause.paused")} — ${first.project}${suffix}`);
      if (traySettings.menuBarLabelStyle !== "hidden") {
        setTrayTitle(t("pause.paused"));
      } else {
        setTrayTitle("");
      }
      return;
    }

    if (!timer) {
      stopTrayTicker();
      return;
    }

    startTrayTicker(
      timer.beginSeconds,
      timer.project,
      timer.activity,
      traySettings.menuBarLabelStyle,
      traySettings.showSecondsInTimer,
    );

    return () => {
      stopTrayTicker();
    };
  }, [timer, hasPausedTimers, pausedTimers, traySettings, t]);

  const visibleFavorites = useMemo(
    () => (activeKey ? favorites.filter((f) => f.key !== activeKey) : favorites),
    [favorites, activeKey],
  );

  const visibleTasks = useMemo(
    () =>
      tasks.filter(
        (task) =>
          !hiddenKeys.has(task.key) &&
          !hiddenKeys.has(taskKeyOf(task.projectId, task.activityId)),
      ),
    [tasks, hiddenKeys],
  );

  const hiddenCount = hiddenKeys.size;

  const timerIssueUrl = useMemo(() => {
    if (!issueIntegration.enabled || !issueIntegration.baseUrl || !timer?.description) return null;
    const base = issueIntegration.baseUrl.replace(/\/+$/, "");
    const urlRegex = new RegExp(`${base.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\S+`, "i");
    const match = timer.description.match(urlRegex);
    return match?.[0] ?? null;
  }, [issueIntegration.enabled, issueIntegration.baseUrl, timer?.description]);

  const handleStartRecent = (task: RecentTask) => {
    startTask(
      {
        projectId: task.projectId,
        activityId: task.activityId,
        description: task.description || undefined,
        tags: task.tags?.length ? task.tags : undefined,
        metadata: pickPluginMetadata(task.metadata, pluginCustomInputs),
        label: task.project,
      },
      task.key,
    );
  };

  const handleHideRecent = useCallback(
    (task: RecentTask) => hideTask(task.key),
    [hideTask],
  );

  const handleDeleteRecent = useCallback(
    (task: RecentTask) => deleteEntry(task.timesheetId),
    [deleteEntry],
  );

  const handleToggleFavorite = useCallback(
    (task: RecentTask) => {
      if (isFavorite(task.key)) {
        removeFav(task.key);
      } else {
        addFav({
          key: task.key,
          projectId: task.projectId,
          activityId: task.activityId,
          project: task.project,
          activity: task.activity,
          customer: task.customer,
          description: task.description,
          tags: task.tags,
          metadata: pickPluginMetadata(task.metadata, pluginCustomInputs),
          projectColor: task.projectColor,
          activityColor: task.activityColor,
          customerColor: task.customerColor,
        });
      }
    },
    [isFavorite, addFav, removeFav, pluginCustomInputs],
  );

  const handleStartFavorite = useCallback(
    (task: FavoriteTask) => {
      startTask(
        {
          projectId: task.projectId,
          activityId: task.activityId,
          description: task.description || undefined,
          tags: task.tags?.length ? task.tags : undefined,
          metadata: pickPluginMetadata(task.metadata, pluginCustomInputs),
          label: task.project,
        },
        task.key,
      );
    },
    [pluginCustomInputs, startTask],
  );

  const handleRemoveFavorite = useCallback(
    (task: FavoriteTask) => removeFav(task.key),
    [removeFav],
  );

  const handleNewTaskSubmit = (
    payload: StartTaskPayload,
    issue: ExternalIssue | null,
  ) => {
    submittedIssueRef.current = {
      payload,
      issue,
      connectionId: activeConnectionId,
    };
    startTask(payload);
  };

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
    storeLinkedIssueForTimer(activeConnectionId, timer.id, linkedIssue);
    // Also remember the issue by task identity so the estimate can be restored
    // when the same project+activity+note is later started from recents/favorites,
    // which don't embed the issue URL in their description.
    storeLinkedIssueForTask(
      activeConnectionId,
      taskKeyOf(timer.projectId, timer.activityId, timer.description),
      linkedIssue,
    );
  }, [timer, linkedIssue, activeConnectionId]);

  // When the current timer has no in-memory link (after a reload/restart or
  // when started from recents), restore it from localStorage and/or the issue
  // URL in the description, then refresh the time stats straight from GitLab.
  useEffect(() => {
    if (!estimateEnabled || !timer || !issueToken) {
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
    const pendingSync = issueTimeSyncsRef.current.get(
      `${activeConnectionId}:${url}`,
    );
    const refreshedIssue = pendingSync
      ? pendingSync.then(() => provider.fetchIssueByUrl!(url))
      : provider.fetchIssueByUrl(url);
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
    timer?.id,
    timerIssueUrl,
    issueToken,
    activeConnectionId,
  ]);

  const showIssueEstimate =
    estimateEnabled && linkedIssue?.timeEstimate != null;

  const compactTimer = popupLayout === "taskbar" || popupLayout === "timeline";

  // Render paused timers as a compact single-row list whenever there is more
  // than one (or an active timer / a compact layout is in play), so several are
  // scannable at once; a lone paused timer keeps the roomier detail card. Cap
  // the list so ~5 compact rows show before it scrolls — the half row of
  // headroom lets the next card peek to signal there is more.
  const pausedCardsCompact =
    !!timer || compactTimer || pausedTimers.length > 1;
  const pausedListMaxHeight = Math.round((pausedCardsCompact ? 40 : 128) * 5.5);
  // Soft-fade the bottom edge only while the list actually scrolls, so the
  // clipped row doesn't leave a hard strip of inter-card margin showing.
  const pausedListRef = useRef<HTMLDivElement>(null);
  const [pausedListScrolls, setPausedListScrolls] = useState(false);
  useEffect(() => {
    const el = pausedListRef.current;
    if (!el) {
      setPausedListScrolls(false);
      return;
    }
    const update = () =>
      setPausedListScrolls(el.scrollHeight > el.clientHeight + 1);
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [pausedTimers, pausedCardsCompact, pausedListMaxHeight]);

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

  /* v8 ignore start -- callbacks execute from native OS menus, outside jsdom */
  const openSettingsWindow = useCallback(async (section?: string) => {
    const settingsWindow = await Window.getByLabel("settings");
    if (!settingsWindow) return;
    await settingsWindow.show();
    await settingsWindow.setFocus();
    if (section) {
      await settingsWindow.emitTo("settings", "kimai://navigate-section", section);
    }
  }, []);

  const openNewTaskForm = useCallback((initialValues?: NewTaskFormInitialValues) => {
    setNewTaskInitialValues(initialValues);
    setNewTaskShortcutRequest(0);
    setShowNewTask(true);
  }, []);
  const openBlankNewTask = useCallback(() => openNewTaskForm(), [openNewTaskForm]);
  const openGeneralSettings = useCallback(() => { void openSettingsWindow(); }, [openSettingsWindow]);
  const openConnectionSettings = useCallback(() => { void openSettingsWindow("connection"); }, [openSettingsWindow]);
  const refreshAllData = useCallback(() => { void invalidateTimesheets(qc); }, [qc]);

  const taskInitialValues = useCallback(
    (task: RecentTask | FavoriteTask): NewTaskFormInitialValues => ({
      projectId: task.projectId,
      activityId: task.activityId,
      description: task.description || undefined,
      tags: task.tags.length > 0 ? task.tags : undefined,
      customInputValues: Object.fromEntries(
        pluginCustomInputs.flatMap((input) => {
          const value = task.metadata?.[input.metadataName];
          return value ? [[input.id, value]] : [];
        }),
      ),
    }),
    [pluginCustomInputs],
  );

  const handleStartWithChanges = useCallback(
    (task: RecentTask | FavoriteTask) => openNewTaskForm(taskInitialValues(task)),
    [openNewTaskForm, taskInitialValues],
  );

  const handleEditRecentEntry = useCallback(
    async (task: RecentTask) => {
      if (!client) return;
      try {
        const entry = await getTimesheet(client, task.timesheetId);
        setEditingEntry({
          id: entry.id,
          projectId: task.projectId,
          activityId: task.activityId,
          project: task.project,
          projectColor: task.projectColor,
          activityColor: task.activityColor,
          customerColor: task.customerColor,
          customer: task.customer,
          activity: task.activity,
          description: entry.description ?? task.description,
          tags: task.tags,
          billable: entry.billable,
          beginIso: entry.begin,
          endIso: entry.end,
          duration: entry.duration,
          isRunning: entry.end === null,
        });
      } catch (error) {
        logger.error(`Failed to load timesheet for editing: ${String(error)}`);
      }
    },
    [client],
  );

  const handleRestartTodayEntry = useCallback(
    (entry: TodayEntry) => {
      void startTask({
        projectId: entry.projectId,
        activityId: entry.activityId,
        description: entry.description || undefined,
        tags: entry.tags.length > 0 ? entry.tags : undefined,
        label: entry.project,
      }, `${entry.projectId}-${entry.activityId}`);
    },
    [startTask],
  );

  const handleToggleTodayFavorite = useCallback(
    (entry: TodayEntry) => {
      const key = `${entry.projectId}-${entry.activityId}`;
      if (isFavorite(key)) {
        void removeFav(key);
        return;
      }
      void addFav({
        key,
        projectId: entry.projectId,
        activityId: entry.activityId,
        project: entry.project,
        activity: entry.activity,
        customer: entry.customer,
        description: entry.description,
        tags: entry.tags,
        projectColor: entry.projectColor,
        activityColor: entry.activityColor,
        customerColor: entry.customerColor,
      });
    },
    [addFav, isFavorite, removeFav],
  );

  const runningEntryContextMenu = useCallback(
    (event: ReactMouseEvent<HTMLElement>) => {
      const entries: ContextMenuEntry[] = [
        ...(timer
          ? [
              { text: t("pause.pause"), enabled: !isPausing && !isStoppingActive, action: pauseTimer },
              { text: t("timer.stopTimer"), enabled: !isPausing && !isStoppingActive, action: stopActiveTimer },
              separator(),
              { text: t("contextMenu.editNote"), action: () => setEditNoteRequest((request) => request + 1) },
            ] satisfies ContextMenuEntry[]
          : []),
        ...(timerIssueUrl
          ? [
              separator(),
              {
                text: t("integrations.openInBrowser"),
                action: () => {
                  void import("@tauri-apps/plugin-opener").then(({ openUrl }) => openUrl(timerIssueUrl));
                },
              },
              {
                text: t("contextMenu.copyIssueUrl"),
                action: () => { void navigator.clipboard.writeText(timerIssueUrl); },
              },
            ] satisfies ContextMenuEntry[]
          : []),
      ];
      void showContextMenu(event, entries);
    },
    [isPausing, isStoppingActive, pauseTimer, stopActiveTimer, t, timer, timerIssueUrl],
  );

  const todayHeaderContextMenu = useCallback(
    (event: ReactMouseEvent<HTMLElement>) => {
      const entries: ContextMenuEntry[] = [
        { text: t("contextMenu.refreshToday"), action: () => { void today.refetch(); } },
        ...(today.totalCount > 0
          ? [{
              text: today.sortAsc ? t("today.newestFirst") : t("today.oldestFirst"),
              action: () => today.setSortAsc(!today.sortAsc),
            } satisfies ContextMenuEntry]
          : []),
        ...(today.hasMore
          ? [{
              text: today.expanded ? t("today.showLess") : t("today.showAll", { count: today.totalCount }),
              action: () => today.setExpanded(!today.expanded),
            } satisfies ContextMenuEntry]
          : []),
      ];
      void showContextMenu(event, entries);
    },
    [t, today],
  );

  const recentHeaderContextMenu = useCallback(
    (event: ReactMouseEvent<HTMLElement>) => {
      const entries: ContextMenuEntry[] = [
        { text: t("contextMenu.refreshRecent"), action: () => { void invalidateTimesheets(qc); } },
        ...(hiddenCount > 0
          ? [{ text: t("recentActions.showAll"), action: clearHidden } satisfies ContextMenuEntry]
          : []),
      ];
      void showContextMenu(event, entries);
    },
    [clearHidden, hiddenCount, qc, t],
  );

  const generalContextMenu = useCallback(
    (event: ReactMouseEvent<HTMLDivElement>) => {
      if (showNewTask || editingEntry) return;
      const target = event.target;
      if (
        target instanceof Element &&
        target.closest("button, input, textarea, select, [role='button'], [role='tab'], [role='option']")
      ) {
        return;
      }
      const entries: ContextMenuEntry[] = [
        { text: t("tray.newTask"), enabled: !!client, action: () => openNewTaskForm() },
        ...(openKimaiInBrowser
          ? [{ text: t("common.openKimai"), action: () => { void openConfiguredKimai(); } } satisfies ContextMenuEntry]
          : []),
        separator(),
        { text: t("common.settings"), action: () => { void openSettingsWindow(); } },
      ];
      void showContextMenu(event, entries);
    },
    [client, editingEntry, openKimaiInBrowser, openNewTaskForm, openSettingsWindow, showNewTask, t],
  );

  const todayContextProps = {
    onRestartEntry: handleRestartTodayEntry,
    onToggleFavoriteEntry: handleToggleTodayFavorite,
    isFavoriteEntry: (entry: TodayEntry) => isFavorite(`${entry.projectId}-${entry.activityId}`),
    onDeleteEntry: (entry: TodayEntry) => deleteEntry(entry.id),
    onRunningEntryContextMenu: runningEntryContextMenu,
    onHeaderContextMenu: todayHeaderContextMenu,
  };
  /* v8 ignore stop */

  const handleTogglePin = useCallback(() => {
    const next = !pinned;
    setPinned(next);
    setAlwaysOnTop(next);
  }, [pinned]);

  return (
    <div
      onContextMenu={generalContextMenu}
      className="relative flex h-screen w-screen flex-col bg-white dark:bg-[#1a1a1a] text-gray-900 dark:text-gray-100"
    >
      {isDetached && (
        <DetachedTitleBar
          pinned={pinned}
          onTogglePin={handleTogglePin}
          pinLabel={pinned ? t("detached.unpin") : t("detached.pin")}
          transparent={document.documentElement.dataset.theme === "transparent"}
        />
      )}
      {!isDetached && (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute bottom-0 left-1/2 z-20 h-1 w-10 -translate-x-1/2 rounded-t-full bg-gray-400/30 dark:bg-gray-500/30"
        />
      )}
      <HeaderStatus
        status={status}
        errorMessage={errorMessage}
        connections={connections}
        activeConnectionId={activeConnectionId}
        onSwitchConnection={switchConnection}
        showOpenKimai={openKimaiInBrowser}
        onOpenKimai={() => void openConfiguredKimai()}
        onRefresh={refreshAllData}
        onOpenConnectionSettings={openConnectionSettings}
      />

      {updater.available && (
        <UpdateBanner
          downloading={updater.downloading}
          label={t("updateSettings.updateLabel", { version: updater.version })}
          onInstall={() => updater.install?.()}
        />
      )}

      {showNewTask && client ? (
        <NewTaskForm
          key={`${client.connectionId}:${newTaskShortcutRequest}`}
          client={client}
          hasActiveTimer={!!timer}
          onSubmit={handleNewTaskSubmit}
          onCancel={() => {
            setShowNewTask(false);
            setNewTaskInitialValues(undefined);
            setNewTaskShortcutRequest(0);
          }}
          isSubmitting={isStartBusy}
          showNote={featureFlags.featureNote}
          showTags={featureFlags.featureTags}
          showCustomerSelect={featureFlags.featureCustomerSelect}
          showCustomStartTime={featureFlags.featureCustomStartTime}
          pluginCustomInputs={pluginCustomInputs}
          showIssuePicker={issueIntegration.enabled}
          issueIntegrationConfig={issueIntegration}
          issueToken={issueToken}
          autoFocusProject={newTaskShortcutRequest > 0}
          initialValues={newTaskInitialValues}
        />
      ) : (
        <>
          <div className="flex flex-1 min-h-0 flex-col">
            {/* Active timer / connection state. In the focus layout this is a
                fixed-height band, so only render it when it has real content —
                otherwise the paused list would sit under an empty reserved
                strip. */}
            {(status === "loading" ||
              status === "unconfigured" ||
              timer ||
              !hasPausedTimers) && (
              <div className="timer-area min-h-0 shrink-0">
                {status === "loading" ? (
                  <EmptyTimerState variant="loading" compact={compactTimer} onNewTask={openBlankNewTask} />
                ) : status === "unconfigured" ? (
                  <EmptyTimerState variant="unconfigured" compact={compactTimer} onNewTask={openBlankNewTask} />
                ) : timer ? (
                  <ActiveTimerCard
                    timer={timer}
                    onStop={stopActiveTimer}
                    onPause={pauseTimer}
                    isStopping={isStoppingActive}
                    isPausing={isPausing}
                    multipleActive={multipleActive}
                    onEdit={editTimer}
                    isSaving={isSaving}
                    saveError={saveError}
                    compact={compactTimer}
                    focusMode={popupLayout === "focus"}
                    showNote={featureFlags.featureNote || editNoteRequest > 0}
                    showTags={featureFlags.featureTags}
                    pluginCustomInputs={pluginCustomInputs}
                    tagSuggestions={tagSuggestions}
                    issueUrl={timerIssueUrl}
                    timeEstimate={showIssueEstimate ? linkedIssue!.timeEstimate : undefined}
                    timeSpent={showIssueEstimate ? linkedIssue!.timeSpent : undefined}
                    colorMode={colorMode}
                    editDescriptionRequest={editNoteRequest}
                    onEditDescriptionRequestHandled={() =>
                      setEditNoteRequest(0)
                    }
                  />
                ) : (
                  <EmptyTimerState compact={compactTimer} onNewTask={openBlankNewTask} />
                )}
              </div>
            )}
            {/* Paused timers live in their own scroll area so they are not
                clipped by the focus layout's fixed-height timer band. */}
            {pausedTimers.length > 0 && (
              <div
                ref={pausedListRef}
                data-scroll-fade={pausedListScrolls ? "true" : undefined}
                className="min-h-0 shrink-0 overflow-y-auto overscroll-contain"
                style={{
                  maxHeight: `${pausedListMaxHeight}px`,
                  ...(pausedListScrolls
                    ? {
                        WebkitMaskImage:
                          "linear-gradient(to bottom, #000 calc(100% - 12px), transparent)",
                        maskImage:
                          "linear-gradient(to bottom, #000 calc(100% - 12px), transparent)",
                      }
                    : {}),
                }}
              >
                {pausedTimers.map((pt) => (
                  <PausedTimerCard
                    key={pt.id}
                    paused={pt}
                    onResume={() => resumeTimer(pt.id)}
                    onStop={() => discardPausedTimer(pt.id)}
                    isResuming={resumingId === pt.id}
                    isStopping={discardingId === pt.id}
                    error={pauseError}
                    onDismissError={dismissPauseError}
                    compact={pausedCardsCompact}
                    colorMode={colorMode}
                    showDescriptionOnHover={
                      featureFlags.featurePausedTimerDescriptionHover
                    }
                  />
                ))}
              </div>
            )}

            {(deepLinkError || switchError || pauseError || timesheetDeleteError) && (
              <ErrorBanner
                message={(deepLinkError || switchError || pauseError || timesheetDeleteError)!}
                onDismiss={
                  deepLinkError
                    ? () => setDeepLinkError(null)
                    : switchError
                    ? dismissError
                    : timesheetDeleteError
                      ? dismissDeleteError
                      : dismissPauseError
                }
              />
            )}

            <div className="mx-3 mt-2 border-t border-gray-100 dark:border-gray-800" />

            {/* Scrollable content — layout-dependent */}
            <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain">
            {featureFlags.featureCategoryMode && client ? (
              <>
                <CategoryModePanel
                  key={client.cacheScope}
                  client={client}
                  connectionId={activeConnectionId}
                  hasActiveTimer={!!timer}
                  startTask={startTask}
                  startingKey={startingKey}
                  disabled={isStartBusy || isStoppingActive || isPausing || resumingId !== null}
                />
                {status !== "unconfigured" && (
                  <TodaySection
                    entries={today.entries}
                    totalCount={today.totalCount}
                    totalDuration={today.totalDuration}
                    hasMore={today.hasMore}
                    expanded={today.expanded}
                    onToggleExpand={() => today.setExpanded(!today.expanded)}
                    sortAsc={today.sortAsc}
                    onToggleSort={() => today.setSortAsc(!today.sortAsc)}
                    isLoading={today.isLoading}
                    isError={today.isError}
                    onRetry={() => today.refetch()}
                    onEditEntry={setEditingEntry}
                    colorMode={colorMode}
                    dailyGoal={dailyGoal}
                    {...todayContextProps}
                  />
                )}
              </>
            ) : popupLayout === "focus" ? (
              <>
                <FocusTabs
                  active={focusTab}
                  recentLabel={t("tray.recentTasks")}
                  todayLabel={t("today.title")}
                  onChange={setFocusTab}
                />
                <FavoriteTasksList
                  tasks={visibleFavorites}
                  onStart={handleStartFavorite}
                  onRemove={handleRemoveFavorite}
                  onStartWithChanges={handleStartWithChanges}
                  startingKey={startingKey}
                  disabled={isStartBusy || isStoppingActive || isPausing || resumingId !== null}
                  colorMode={colorMode}
                />
                {focusTab === "recent" ? (
                  <RecentTasksList
                    tasks={visibleTasks}
                    onStart={handleStartRecent}
                    onStartWithChanges={handleStartWithChanges}
                    onEditLastEntry={handleEditRecentEntry}
                    onHide={handleHideRecent}
                    onDelete={handleDeleteRecent}
                    onToggleFavorite={handleToggleFavorite}
                    isFavorite={isFavorite}
                    isLoading={status !== "unconfigured" && tasksLoading}
                    startingKey={startingKey}
                    deletingId={deletingId}
                    disabled={isStartBusy || isStoppingActive || isPausing || resumingId !== null}
                    hiddenCount={hiddenCount}
                    onShowAll={clearHidden}
                    onHeaderContextMenu={recentHeaderContextMenu}
                    showHeader={false}
                    colorMode={colorMode}
                  />
                ) : status !== "unconfigured" ? (
                  <TodaySection
                    entries={today.entries}
                    totalCount={today.totalCount}
                    totalDuration={today.totalDuration}
                    hasMore={today.hasMore}
                    expanded={today.expanded}
                    onToggleExpand={() => today.setExpanded(!today.expanded)}
                    sortAsc={today.sortAsc}
                    onToggleSort={() => today.setSortAsc(!today.sortAsc)}
                    isLoading={today.isLoading}
                    isError={today.isError}
                    onRetry={() => today.refetch()}
                    onEditEntry={setEditingEntry}
                    colorMode={colorMode}
                    dailyGoal={dailyGoal}
                    {...todayContextProps}
                  />
                ) : null}
              </>
            ) : popupLayout === "timeline" ? (
              <>
                {/* Today first */}
                {status !== "unconfigured" && (
                  <>
                    <TodaySection
                      entries={today.entries}
                      totalCount={today.totalCount}
                      totalDuration={today.totalDuration}
                      hasMore={today.hasMore}
                      expanded={today.expanded}
                      onToggleExpand={() => today.setExpanded(!today.expanded)}
                      sortAsc={today.sortAsc}
                      onToggleSort={() => today.setSortAsc(!today.sortAsc)}
                      isLoading={today.isLoading}
                      isError={today.isError}
                      onRetry={() => today.refetch()}
                      onEditEntry={setEditingEntry}
                      colorMode={colorMode}
                      dailyGoal={dailyGoal}
                      {...todayContextProps}
                    />
                    <div className="mx-3 border-t border-gray-100 dark:border-gray-800" />
                  </>
                )}
                <FavoriteTasksList
                  tasks={visibleFavorites}
                  onStart={handleStartFavorite}
                  onRemove={handleRemoveFavorite}
                  onStartWithChanges={handleStartWithChanges}
                  startingKey={startingKey}
                  disabled={isStartBusy || isStoppingActive || isPausing || resumingId !== null}
                  colorMode={colorMode}
                />
                {/* Collapsible recent tasks */}
                <CollapsibleTraySection
                  title={t("tray.recentTasks")}
                  collapsed={recentCollapsed}
                  onToggle={() => setRecentCollapsed(!recentCollapsed)}
                  onContextMenu={recentHeaderContextMenu}
                >
                    <RecentTasksList
                      tasks={visibleTasks}
                      onStart={handleStartRecent}
                      onStartWithChanges={handleStartWithChanges}
                      onEditLastEntry={handleEditRecentEntry}
                      onHide={handleHideRecent}
                      onDelete={handleDeleteRecent}
                      onToggleFavorite={handleToggleFavorite}
                      isFavorite={isFavorite}
                      isLoading={status !== "unconfigured" && tasksLoading}
                      startingKey={startingKey}
                      deletingId={deletingId}
                      disabled={isStartBusy || isStoppingActive || isPausing || resumingId !== null}
                      hiddenCount={hiddenCount}
                      onShowAll={clearHidden}
                      onHeaderContextMenu={recentHeaderContextMenu}
                      showHeader={false}
                      colorMode={colorMode}
                    />
                </CollapsibleTraySection>
              </>
            ) : popupLayout === "taskbar" ? (
              <>
                <FavoriteTasksList
                  tasks={visibleFavorites}
                  onStart={handleStartFavorite}
                  onRemove={handleRemoveFavorite}
                  onStartWithChanges={handleStartWithChanges}
                  startingKey={startingKey}
                  disabled={isStartBusy || isStoppingActive || isPausing || resumingId !== null}
                  colorMode={colorMode}
                />
                <RecentTasksList
                  tasks={visibleTasks}
                  onStart={handleStartRecent}
                  onStartWithChanges={handleStartWithChanges}
                  onEditLastEntry={handleEditRecentEntry}
                  onHide={handleHideRecent}
                  onDelete={handleDeleteRecent}
                  onToggleFavorite={handleToggleFavorite}
                  isFavorite={isFavorite}
                  isLoading={status !== "unconfigured" && tasksLoading}
                  startingKey={startingKey}
                  deletingId={deletingId}
                  disabled={isStartBusy || isStoppingActive || isPausing || resumingId !== null}
                  hiddenCount={hiddenCount}
                  onShowAll={clearHidden}
                  onHeaderContextMenu={recentHeaderContextMenu}
                  colorMode={colorMode}
                />
                {status !== "unconfigured" && (
                  <>
                    <div className="mx-3 border-t border-gray-100 dark:border-gray-800" />
                    {/* Collapsible today section */}
                    <CollapsibleTraySection
                      title={t("today.title")}
                      detail={
                        today.totalCount > 0 ? (
                          <span className="text-[10px] tabular-nums text-gray-400 dark:text-gray-500">
                            {today.totalDuration > 0 &&
                              `${Math.floor(today.totalDuration / 3600)}h ${Math.floor((today.totalDuration % 3600) / 60)}m`}
                          </span>
                        ) : undefined
                      }
                      collapsed={todayCollapsed}
                      onToggle={() => setTodayCollapsed(!todayCollapsed)}
                      onContextMenu={todayHeaderContextMenu}
                    >
                        <TodaySection
                          entries={today.entries}
                          totalCount={today.totalCount}
                          totalDuration={today.totalDuration}
                          hasMore={today.hasMore}
                          expanded={today.expanded}
                          onToggleExpand={() => today.setExpanded(!today.expanded)}
                          sortAsc={today.sortAsc}
                          onToggleSort={() => today.setSortAsc(!today.sortAsc)}
                          isLoading={today.isLoading}
                          isError={today.isError}
                          onRetry={() => today.refetch()}
                          onEditEntry={setEditingEntry}
                          colorMode={colorMode}
                          dailyGoal={dailyGoal}
                          {...todayContextProps}
                        />
                    </CollapsibleTraySection>
                  </>
                )}
              </>
            ) : (
              /* Classic layout */
              <>
                <FavoriteTasksList
                  tasks={visibleFavorites}
                  onStart={handleStartFavorite}
                  onRemove={handleRemoveFavorite}
                  onStartWithChanges={handleStartWithChanges}
                  startingKey={startingKey}
                  disabled={isStartBusy || isStoppingActive || isPausing || resumingId !== null}
                  colorMode={colorMode}
                />
                <RecentTasksList
                  tasks={visibleTasks}
                  onStart={handleStartRecent}
                  onStartWithChanges={handleStartWithChanges}
                  onEditLastEntry={handleEditRecentEntry}
                  onHide={handleHideRecent}
                  onDelete={handleDeleteRecent}
                  onToggleFavorite={handleToggleFavorite}
                  isFavorite={isFavorite}
                  isLoading={status !== "unconfigured" && tasksLoading}
                  startingKey={startingKey}
                  deletingId={deletingId}
                  disabled={isStartBusy || isStoppingActive || isPausing || resumingId !== null}
                  hiddenCount={hiddenCount}
                  onShowAll={clearHidden}
                  onHeaderContextMenu={recentHeaderContextMenu}
                  colorMode={colorMode}
                />
                {status !== "unconfigured" && (
                  <>
                    <div className="mx-3 border-t border-gray-100 dark:border-gray-800" />
                    <TodaySection
                      entries={today.entries}
                      totalCount={today.totalCount}
                      totalDuration={today.totalDuration}
                      hasMore={today.hasMore}
                      expanded={today.expanded}
                      onToggleExpand={() => today.setExpanded(!today.expanded)}
                      sortAsc={today.sortAsc}
                      onToggleSort={() => today.setSortAsc(!today.sortAsc)}
                      isLoading={today.isLoading}
                      isError={today.isError}
                      onRetry={() => today.refetch()}
                      onEditEntry={setEditingEntry}
                      colorMode={colorMode}
                      dailyGoal={dailyGoal}
                      {...todayContextProps}
                    />
                  </>
                )}
              </>
            )}
            </div>
          </div>

          <PopupFooterActions
            onNewTask={openBlankNewTask}
            onSettings={openGeneralSettings}
          />
        </>
      )}

      {editingEntry && (
        <TimesheetEditDialog
          entry={editingEntry}
          onSave={editCompletedTimesheet}
          onClose={() => setEditingEntry(null)}
        />
      )}

      <ApiErrorDialog />
    </div>
  );
}
