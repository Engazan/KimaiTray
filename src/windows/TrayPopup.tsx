import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useQueryClient } from "@tanstack/react-query";
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
import NewTaskForm from "../components/NewTaskForm";
import CategoryModePanel from "../categorymode/CategoryModePanel";
import IdleDialog from "../components/IdleDialog";
import ApiErrorDialog from "../components/ApiErrorDialog";
import TodaySection from "../components/TodaySection";
import DetachedTitleBar from "../components/DetachedTitleBar";
import { useKimaiClient } from "../hooks/useKimaiClient";
import { useActiveTimer } from "../hooks/useActiveTimer";
import { useRecentTasks } from "../hooks/useRecentTasks";
import { useTodayTimesheets } from "../hooks/useTodayTimesheets";
import { useStartTask } from "../hooks/useStartTask";
import type { StartTaskPayload } from "../hooks/useStartTask";
import { useEditTimer } from "../hooks/useEditTimer";
import { usePauseTimer } from "../hooks/usePauseTimer";
import { useHiddenTasks } from "../hooks/useHiddenTasks";
import { useFavorites } from "../hooks/useFavorites";
import { useKimaiTags } from "../hooks/useKimaiTags";
import { useDeleteTimesheet } from "../hooks/useDeleteTimesheet";
import { useIdleDetection } from "../hooks/useIdleDetection";
import { setTrayTooltip, setTrayTitle, setTrayIcon, startTrayTicker, stopTrayTicker, updateTrayMenu, registerShortcuts, setAlwaysOnTop } from "../api/trayApi";
import { formatAcceleratorForDisplay } from "../settings/Controls";
import { useAppearance } from "../hooks/useAppearance";
import { invalidateTimesheets } from "../hooks/invalidateTimesheets";
import { useLanguageSync } from "../hooks/useLanguageSync";
import { useUpdater } from "../hooks/useUpdater";
import { getTimesheet, updateTimesheet, stopTimesheet } from "../api/timesheetApi";
import type { RecentTask, FavoriteTask } from "../types";
import type { ExternalIssue } from "../integrations/issues/types";
import { createIssueProvider } from "../integrations/issues/issueProvider";
import {
  readLinkedIssueForTimer,
  readLinkedIssueMap,
  storeLinkedIssueForTask,
  storeLinkedIssueForTimer,
  taskKeyOf,
} from "../integrations/issues/linkedIssueStore";
import { logger } from "../utils/logger";
import { getRecordedDurationSeconds } from "../utils/timesheetDuration";
import { toKimaiLocal } from "../utils/time";

export default function TrayPopup() {
  const { t, i18n } = useTranslation();
  const qc = useQueryClient();
  const [showNewTask, setShowNewTask] = useState(false);
  const [idleProcessing, setIdleProcessing] = useState(false);
  const [idleActionError, setIdleActionError] = useState<string | null>(null);
  const [focusTab, setFocusTab] = useState<"recent" | "today">("recent");
  const [recentCollapsed, setRecentCollapsed] = useState(false);
  const [todayCollapsed, setTodayCollapsed] = useState(false);

  useAppearance();
  useLanguageSync();

  useEffect(() => {
    const win = getCurrentWindow();
    const unlisten = win.listen("kimai://refresh", () => {
      invalidateTimesheets(qc);
    });
    return () => { unlisten.then((fn) => fn()); };
  }, [qc]);

  const {
    client,
    isConfigured,
    refreshInterval,
    baseUrl,
    openKimaiInBrowser,
    idleSettings,
    traySettings,
    shortcutSettings,
    featureFlags,
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
  } = useActiveTimer(client, isConfigured, refreshInterval);

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
  } = usePauseTimer(client, timer, activeConnectionId);

  const activeKey = timer ? `${timer.projectId}-${timer.activityId}` : null;
  const { tasks, isLoading: tasksLoading } = useRecentTasks(
    client,
    isConfigured,
    activeKey,
  );

  const today = useTodayTimesheets(client, isConfigured, refreshInterval);

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
  const linkedIssueRef = useRef<ExternalIssue | null>(null);
  const linkedIssueConnectionRef = useRef<string | null>(null);
  const [linkedIssue, setLinkedIssue] = useState<ExternalIssue | null>(null);
  const prevTimerIdRef = useRef<number | null>(null);

  const { startTask, startingKey, switchError, dismissError, isStarting } =
    useStartTask(
      client,
      (entry, payload) => {
        setShowNewTask(false);
        const submitted = submittedIssueRef.current;
        submittedIssueRef.current = null;
        if (
          submitted?.payload === payload &&
          submitted.issue &&
          submitted.connectionId === activeConnectionId
        ) {
          pendingLinkedIssueRef.current = {
            timerId: entry.id,
            issue: submitted.issue,
            connectionId: submitted.connectionId,
          };
          storeLinkedIssueForTimer(
            submitted.connectionId,
            entry.id,
            submitted.issue,
          );
          storeLinkedIssueForTask(
            submitted.connectionId,
            taskKeyOf(payload.projectId, payload.activityId),
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

  const { editTimer, isSaving, saveError } = useEditTimer(client);
  const { hiddenKeys, hideTask, clearAll: clearHidden } = useHiddenTasks(activeConnectionId);
  const { favorites, addFavorite: addFav, removeFavorite: removeFav, isFavorite } = useFavorites(activeConnectionId, baseUrl);
  const tagSuggestions = useKimaiTags(client);
  const { deleteEntry, deletingId, deleteError: timesheetDeleteError, dismissError: dismissDeleteError } = useDeleteTimesheet(client);

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
      sendNotification({
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
      linkedIssueConnectionRef.current &&
      linkedIssueConnectionRef.current !== activeConnectionId
    ) {
      linkedIssueRef.current = null;
      linkedIssueConnectionRef.current = null;
      setLinkedIssue(null);
    }
    if (
      pendingLinkedIssueRef.current &&
      pendingLinkedIssueRef.current.connectionId !== activeConnectionId
    ) {
      pendingLinkedIssueRef.current = null;
    }
  }, [activeConnectionId]);

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
    linkedIssueRef.current = pending.issue;
    linkedIssueConnectionRef.current = pending.connectionId;
    setLinkedIssue(pending.issue);
  }, [timer?.id, activeConnectionId, pendingLinkedIssueVersion]);

  useEffect(() => {
    const prevId = prevTimerIdRef.current;

    prevTimerIdRef.current = timer?.id ?? null;

    // Drop the estimate badge once no timer is running.
    if (timer == null) setLinkedIssue(null);

    if (
      prevId != null &&
      (timer == null || timer.id !== prevId) &&
      linkedIssueRef.current
    ) {
      const issue = linkedIssueRef.current;
      const belongsToActiveConnection =
        linkedIssueConnectionRef.current === activeConnectionId;
      linkedIssueRef.current = null;
      linkedIssueConnectionRef.current = null;

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
          void getTimesheet(client, prevId)
            .then((entry) => {
              const durationSeconds = getRecordedDurationSeconds(entry);
              if (durationSeconds == null || durationSeconds <= 0) return;
              return provider.addSpentTime?.(issue.id, durationSeconds);
            })
            .catch(() => {
              logger.error("Failed to sync spent time to issue provider");
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

  // Global shortcut: toggle timer
  const stopActiveTimerRef = useRef(stopActiveTimer);
  stopActiveTimerRef.current = stopActiveTimer;

  useEffect(() => {
    const win = getCurrentWindow();
    const unlisten = win.listen("kimai://toggle-timer", () => {
      stopActiveTimerRef.current();
    });
    return () => { unlisten.then((fn) => fn()); };
  }, []);

  // Re-register global shortcuts when settings change
  useEffect(() => {
    registerShortcuts({
      togglePopup: shortcutSettings.shortcutTogglePopup,
      startStopTimer: shortcutSettings.shortcutStartStopTimer,
      openSettings: shortcutSettings.shortcutOpenSettings,
    }).catch(() => {});
  }, [
    shortcutSettings.shortcutTogglePopup,
    shortcutSettings.shortcutStartStopTimer,
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
      setShowNewTask(true);
    }
  }, [client, timer, idleStartedAt, dismissIdle, qc, t]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (showNewTask) {
          setShowNewTask(false);
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
    () => tasks.filter((t) => !hiddenKeys.has(t.key)),
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
          projectColor: task.projectColor,
          activityColor: task.activityColor,
          customerColor: task.customerColor,
        });
      }
    },
    [isFavorite, addFav, removeFav],
  );

  const handleStartFavorite = useCallback(
    (task: FavoriteTask) => {
      startTask(
        {
          projectId: task.projectId,
          activityId: task.activityId,
          description: task.description || undefined,
          tags: task.tags?.length ? task.tags : undefined,
          label: task.project,
        },
        task.key,
      );
    },
    [startTask],
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
    // when the same project+activity is later started from recents/favorites,
    // which don't embed the issue URL in their description.
    storeLinkedIssueForTask(
      activeConnectionId,
      taskKeyOf(timer.projectId, timer.activityId),
      linkedIssue,
    );
  }, [timer, linkedIssue, activeConnectionId]);

  // When the in-memory link is gone (after a reload/restart), restore it for
  // the running timer from localStorage and/or the issue URL in the
  // description, then refresh the time stats straight from GitLab.
  const [fetchedIssue, setFetchedIssue] = useState<ExternalIssue | null>(null);

  useEffect(() => {
    if (linkedIssue || !estimateEnabled || !timer || !issueToken) {
      setFetchedIssue(null);
      return;
    }

    let storedIssue = readLinkedIssueForTimer(activeConnectionId, timer.id);

    // Fall back to the per-task association (project+activity). This is what
    // makes the badge appear for timers started from recents/favorites: they
    // have no stored timerId match and usually no issue URL in the description.
    if (!storedIssue) {
      const byKey = readLinkedIssueMap(activeConnectionId)[
        taskKeyOf(timer.projectId, timer.activityId)
      ];
      if (byKey) storedIssue = byKey;
    }

    const url = storedIssue?.webUrl ?? timerIssueUrl;
    const provider = createIssueProvider(
      issueIntegration,
      issueToken,
      activeConnectionId,
    );
    if (!url || !provider.fetchIssueByUrl) {
      setFetchedIssue(storedIssue);
      linkedIssueRef.current = storedIssue;
      linkedIssueConnectionRef.current = storedIssue
        ? activeConnectionId
        : null;
      return;
    }

    let cancelled = false;
    provider
      .fetchIssueByUrl(url)
      .then((issue) => {
        if (!cancelled) {
          const restored = issue ?? storedIssue;
          setFetchedIssue(restored);
          linkedIssueRef.current = restored;
          linkedIssueConnectionRef.current = restored
            ? activeConnectionId
            : null;
        }
      })
      .catch(() => {
        if (!cancelled) {
          setFetchedIssue(storedIssue);
          linkedIssueRef.current = storedIssue;
          linkedIssueConnectionRef.current = storedIssue
            ? activeConnectionId
            : null;
        }
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

  const estimateIssue = linkedIssue ?? fetchedIssue;
  const showIssueEstimate = estimateEnabled && estimateIssue?.timeEstimate != null;

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

  const handleTogglePin = useCallback(() => {
    const next = !pinned;
    setPinned(next);
    setAlwaysOnTop(next);
  }, [pinned]);

  return (
    <div className="relative flex h-screen w-screen flex-col bg-white dark:bg-[#1a1a1a] text-gray-900 dark:text-gray-100">
      {isDetached && (
        <DetachedTitleBar
          pinned={pinned}
          onTogglePin={handleTogglePin}
          pinLabel={pinned ? t("detached.unpin") : t("detached.pin")}
          transparent={document.documentElement.dataset.theme === "transparent"}
        />
      )}
      <HeaderStatus
        status={status}
        errorMessage={errorMessage}
        connections={connections}
        activeConnectionId={activeConnectionId}
        onSwitchConnection={switchConnection}
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
          key={client.connectionId}
          client={client}
          hasActiveTimer={!!timer}
          onSubmit={handleNewTaskSubmit}
          onCancel={() => setShowNewTask(false)}
          isSubmitting={isStarting}
          showNote={featureFlags.featureNote}
          showTags={featureFlags.featureTags}
          showCustomerSelect={featureFlags.featureCustomerSelect}
          showCustomStartTime={featureFlags.featureCustomStartTime}
          showIssuePicker={issueIntegration.enabled}
          issueIntegrationConfig={issueIntegration}
          issueToken={issueToken}
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
                  <EmptyTimerState variant="loading" compact={compactTimer} />
                ) : status === "unconfigured" ? (
                  <EmptyTimerState variant="unconfigured" compact={compactTimer} />
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
                    showNote={featureFlags.featureNote}
                    showTags={featureFlags.featureTags}
                    tagSuggestions={tagSuggestions}
                    issueUrl={timerIssueUrl}
                    timeEstimate={showIssueEstimate ? estimateIssue!.timeEstimate : undefined}
                    timeSpent={showIssueEstimate ? estimateIssue!.timeSpent : undefined}
                    colorMode={colorMode}
                  />
                ) : (
                  <EmptyTimerState compact={compactTimer} />
                )}
              </div>
            )}
            {/* Paused timers live in their own scroll area so they are not
                clipped by the focus layout's fixed-height timer band. */}
            {pausedTimers.length > 0 && (
              <div
                ref={pausedListRef}
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

            {(switchError || pauseError || timesheetDeleteError) && (
              <ErrorBanner
                message={(switchError || pauseError || timesheetDeleteError)!}
                onDismiss={
                  switchError
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
                  disabled={isStarting || isStoppingActive || isPausing || resumingId !== null}
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
                    colorMode={colorMode}
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
                  startingKey={startingKey}
                  disabled={isStarting || isStoppingActive || isPausing || resumingId !== null}
                  colorMode={colorMode}
                />
                {focusTab === "recent" ? (
                  <RecentTasksList
                    tasks={visibleTasks}
                    onStart={handleStartRecent}
                    onHide={handleHideRecent}
                    onDelete={handleDeleteRecent}
                    onToggleFavorite={handleToggleFavorite}
                    isFavorite={isFavorite}
                    isLoading={status !== "unconfigured" && tasksLoading}
                    startingKey={startingKey}
                    deletingId={deletingId}
                    disabled={isStarting || isStoppingActive || isPausing || resumingId !== null}
                    hiddenCount={hiddenCount}
                    onShowAll={clearHidden}
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
                    colorMode={colorMode}
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
                      colorMode={colorMode}
                    />
                    <div className="mx-3 border-t border-gray-100 dark:border-gray-800" />
                  </>
                )}
                <FavoriteTasksList
                  tasks={visibleFavorites}
                  onStart={handleStartFavorite}
                  onRemove={handleRemoveFavorite}
                  startingKey={startingKey}
                  disabled={isStarting || isStoppingActive || isPausing || resumingId !== null}
                  colorMode={colorMode}
                />
                {/* Collapsible recent tasks */}
                <CollapsibleTraySection
                  title={t("tray.recentTasks")}
                  collapsed={recentCollapsed}
                  onToggle={() => setRecentCollapsed(!recentCollapsed)}
                >
                    <RecentTasksList
                      tasks={visibleTasks}
                      onStart={handleStartRecent}
                      onHide={handleHideRecent}
                      onDelete={handleDeleteRecent}
                      onToggleFavorite={handleToggleFavorite}
                      isFavorite={isFavorite}
                      isLoading={status !== "unconfigured" && tasksLoading}
                      startingKey={startingKey}
                      deletingId={deletingId}
                      disabled={isStarting || isStoppingActive || isPausing || resumingId !== null}
                      hiddenCount={hiddenCount}
                      onShowAll={clearHidden}
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
                  startingKey={startingKey}
                  disabled={isStarting || isStoppingActive || isPausing || resumingId !== null}
                  colorMode={colorMode}
                />
                <RecentTasksList
                  tasks={visibleTasks}
                  onStart={handleStartRecent}
                  onHide={handleHideRecent}
                  onDelete={handleDeleteRecent}
                  onToggleFavorite={handleToggleFavorite}
                  isFavorite={isFavorite}
                  isLoading={status !== "unconfigured" && tasksLoading}
                  startingKey={startingKey}
                  deletingId={deletingId}
                  disabled={isStarting || isStoppingActive || isPausing || resumingId !== null}
                  hiddenCount={hiddenCount}
                  onShowAll={clearHidden}
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
                          colorMode={colorMode}
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
                  startingKey={startingKey}
                  disabled={isStarting || isStoppingActive || isPausing || resumingId !== null}
                  colorMode={colorMode}
                />
                <RecentTasksList
                  tasks={visibleTasks}
                  onStart={handleStartRecent}
                  onHide={handleHideRecent}
                  onDelete={handleDeleteRecent}
                  onToggleFavorite={handleToggleFavorite}
                  isFavorite={isFavorite}
                  isLoading={status !== "unconfigured" && tasksLoading}
                  startingKey={startingKey}
                  deletingId={deletingId}
                  disabled={isStarting || isStoppingActive || isPausing || resumingId !== null}
                  hiddenCount={hiddenCount}
                  onShowAll={clearHidden}
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
                      colorMode={colorMode}
                    />
                  </>
                )}
              </>
            )}
            </div>
          </div>

          <PopupFooterActions
            onNewTask={() => setShowNewTask(true)}
            showOpenKimai={openKimaiInBrowser}
            onOpenKimai={async () => {
              const { openUrl } = await import("@tauri-apps/plugin-opener");
              if (baseUrl) openUrl(baseUrl);
            }}
            onSettings={async () => {
              const w = await Window.getByLabel("settings");
              if (w) {
                await w.show();
                await w.setFocus();
              }
            }}
          />
        </>
      )}

      <ApiErrorDialog />

      {showIdleDialog && (
        <IdleDialog
          timer={timer}
          idleStartedAt={idleStartedAt}
          idleDurationSeconds={idleDurationSeconds}
          onContinue={handleIdleContinue}
          onStopAtIdleStart={handleIdleStopAtStart}
          onStopNow={handleIdleStopNow}
          onStopAndStartNew={handleIdleStopAndNew}
          isProcessing={idleProcessing}
          error={idleActionError}
        />
      )}
    </div>
  );
}
