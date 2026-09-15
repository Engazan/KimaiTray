import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { MouseEvent as ReactMouseEvent } from "react";
import { useTranslation } from "react-i18next";
import { useQueryClient } from "@tanstack/react-query";
import { getCurrentWindow, Window } from "@tauri-apps/api/window";
import HeaderStatus from "../components/HeaderStatus";
import IssueTimeSyncFeedback from "../components/IssueTimeSyncFeedback";
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
import { useNoTimerReminder } from "../hooks/useNoTimerReminder";
import { openKimaiInBrowser as openConfiguredKimai, setAlwaysOnTop } from "../api/trayApi";
import { useAppearance } from "../hooks/useAppearance";
import { invalidateTimesheets } from "../hooks/invalidateTimesheets";
import { useLanguageSync } from "../hooks/useLanguageSync";
import { useUpdater } from "../hooks/useUpdater";
import { getTimesheet } from "../api/timesheetApi";
import { logger } from "../utils/logger";
import type { RecentTask, FavoriteTask, TodayEntry } from "../types";
import type { ExternalIssue } from "../integrations/issues/types";
import { taskKeyOf } from "../integrations/issues/linkedIssueStore";
import { getStringTimesheetMetadata } from "../api/timesheetMeta";
import {
  getEnabledPluginCustomInputs,
  pickPluginMetadata,
} from "../plugins/customInputs";
import { useInstalledChangelog } from "../tray/useInstalledChangelog";
import { useTrayPresentation } from "../tray/useTrayPresentation";
import { useTraySystemEvents } from "../tray/useTraySystemEvents";
import { useIdleTimerWorkflow } from "../tray/useIdleTimerWorkflow";
import { useTrayDeepLinks } from "../tray/useTrayDeepLinks";
import { useTimerIssueLink } from "../tray/useTimerIssueLink";
import { separator, showContextMenu, type ContextMenuEntry } from "../components/contextMenu";

export default function TrayPopup() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [showNewTask, setShowNewTask] = useState(false);
  const [newTaskInitialValues, setNewTaskInitialValues] =
    useState<NewTaskFormInitialValues>();
  const [newTaskShortcutRequest, setNewTaskShortcutRequest] = useState(0);
  const [editNoteRequest, setEditNoteRequest] = useState(0);
  const [focusTab, setFocusTab] = useState<"recent" | "today">("recent");
  const [recentCollapsed, setRecentCollapsed] = useState(false);
  const [todayCollapsed, setTodayCollapsed] = useState(false);
  const [editingEntry, setEditingEntry] = useState<TodayEntry | null>(null);

  useAppearance();
  useLanguageSync();

  useInstalledChangelog();

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
    timesheetCustomFields,
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
    () => getEnabledPluginCustomInputs(pluginFlags, timesheetCustomFields ?? []),
    [pluginFlags, timesheetCustomFields],
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

  const issueLink = useTimerIssueLink({
    client, timer, activeConnectionId, issueIntegration, issueToken,
  });
  const { timerIssueUrl, linkedIssue, showIssueEstimate } = issueLink;
  const closeNewTask = useCallback(() => {
    setShowNewTask(false);
    setNewTaskShortcutRequest(0);
  }, []);
  const openTaskFromShortcut = useCallback((values?: NewTaskFormInitialValues) => {
    setNewTaskInitialValues(values);
    setNewTaskShortcutRequest((request) => request + 1);
    setShowNewTask(true);
  }, []);
  const openTaskAfterIdle = useCallback(() => {
    setNewTaskInitialValues(undefined);
    setNewTaskShortcutRequest(0);
    setShowNewTask(true);
  }, []);
  const { startTask, startingKey, switchError, dismissError, isStarting } = useStartTask(
    client,
    (entry, payload) => {
      closeNewTask();
      setNewTaskInitialValues(undefined);
      issueLink.onTaskStarted(entry, payload);
    },
    issueLink.onTaskFailed,
  );
  const { rememberSubmission } = issueLink;
  const startWithIssue = useCallback(
    (payload: StartTaskPayload, issue: ExternalIssue | null, trackingKey?: string) => {
      rememberSubmission(payload, issue);
      return startTask(payload, trackingKey);
    },
    [rememberSubmission, startTask],
  );
  const timerMutationBusy = isStarting || isPausing || isStoppingActive ||
    resumingId !== null || discardingId !== null;
  const { idleProcessing } = useIdleTimerWorkflow({
    client, timer, idleSettings, openNewTask: openTaskAfterIdle,
    timerActionsDisabled: timerMutationBusy,
  });
  const { deepLinkProcessing, deepLinkError, dismissDeepLinkError } = useTrayDeepLinks({
    client, activeConnectionId, connections, settingsReady, isConfigured,
    busy: timerMutationBusy || idleProcessing,
    issueIntegration, issueToken, pluginCustomInputs, switchConnection,
    startWithIssue, openForm: openTaskFromShortcut, closeForm: closeNewTask,
  });
  const isStartBusy = isStarting || deepLinkProcessing;
  const timerActionsDisabled = timerMutationBusy || idleProcessing || deepLinkProcessing;

  useTrayPresentation({ timer, status, hasPausedTimers, pausedTimers, traySettings, shortcutSettings });
  useTraySystemEvents({
    shortcutSettings,
    stopTimerOnScreensaver: idleSettings.stopTimerOnScreensaver,
    stopTimerOnScreenLock: idleSettings.stopTimerOnScreenLock,
    stopTimer: stopActiveTimer,
    refresh: () => { void invalidateTimesheets(qc); },
    newTask: openTaskFromShortcut,
    pauseResume: () => {
      if (timer) { pauseTimer(); return; }
      const mostRecent = pausedTimers.reduce<(typeof pausedTimers)[number] | null>(
        (latest, paused) => !latest || paused.pausedAt > latest.pausedAt ? paused : latest,
        null,
      );
      if (mostRecent) resumeTimer(mostRecent.id);
    },
    continueLastTask: () => {
      const task = tasks[0];
      if (!task) return;
      void startTask({
        projectId: task.projectId, activityId: task.activityId,
        description: task.description || undefined,
        tags: task.tags?.length ? task.tags : undefined,
        metadata: pickPluginMetadata(task.metadata, pluginCustomInputs), label: task.project,
      }, task.key);
    },
    editNote: () => {
      if (!timer) return;
      closeNewTask();
      setNewTaskInitialValues(undefined);
      setEditNoteRequest((request) => request + 1);
    },
  });

  const { editTimer, isSaving, saveError } = useEditTimer(client);
  const { editTimesheet: editCompletedTimesheet } = useEditTimesheet(client);
  const { hiddenKeys, hideTask, clearAll: clearHidden } = useHiddenTasks(activeConnectionId);
  const { favorites, addFavorite: addFav, removeFavorite: removeFav, isFavorite } = useFavorites(activeConnectionId, baseUrl);
  const tagSuggestions = useKimaiTags(client);
  const { deleteEntry, deletingId, deleteError: timesheetDeleteError, dismissError: dismissDeleteError } = useDeleteTimesheet(client);

  useEffect(() => {
    setEditingEntry(null);
  }, [activeConnectionId]);

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

  const handleNewTaskSubmit = (payload: StartTaskPayload, issue: ExternalIssue | null) => {
    void startWithIssue(payload, issue);
  };

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
          metadata: getStringTimesheetMetadata(entry),
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
              { text: t("pause.pause"), enabled: !timerActionsDisabled, action: pauseTimer },
              { text: t("timer.stopTimer"), enabled: !timerActionsDisabled, action: stopActiveTimer },
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
    [timerActionsDisabled, pauseTimer, stopActiveTimer, t, timer, timerIssueUrl],
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

      <IssueTimeSyncFeedback sync={issueLink.timeSync} />

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
                    actionsDisabled={timerActionsDisabled}
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
                    actionsDisabled={timerActionsDisabled}
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
                    ? dismissDeepLinkError
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
                  disabled={timerActionsDisabled}
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
                  disabled={timerActionsDisabled}
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
                    disabled={timerActionsDisabled}
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
                  disabled={timerActionsDisabled}
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
                      disabled={timerActionsDisabled}
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
                  disabled={timerActionsDisabled}
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
                  disabled={timerActionsDisabled}
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
                  disabled={timerActionsDisabled}
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
                  disabled={timerActionsDisabled}
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
          customInputs={pluginCustomInputs}
          onSave={editCompletedTimesheet}
          onClose={() => setEditingEntry(null)}
        />
      )}

      <ApiErrorDialog />
    </div>
  );
}
