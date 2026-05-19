import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useQueryClient } from "@tanstack/react-query";
import { getCurrentWindow, Window } from "@tauri-apps/api/window";
import HeaderStatus from "../components/HeaderStatus";
import ActiveTimerCard from "../components/ActiveTimerCard";
import PausedTimerCard from "../components/PausedTimerCard";
import EmptyTimerState from "../components/EmptyTimerState";
import RecentTasksList from "../components/RecentTasksList";
import PopupFooterActions from "../components/PopupFooterActions";
import NewTaskForm from "../components/NewTaskForm";
import IdleDialog from "../components/IdleDialog";
import TodaySection from "../components/TodaySection";
import { useKimaiClient } from "../hooks/useKimaiClient";
import { useActiveTimer } from "../hooks/useActiveTimer";
import { useRecentTasks } from "../hooks/useRecentTasks";
import { useTodayTimesheets } from "../hooks/useTodayTimesheets";
import { useStartTask } from "../hooks/useStartTask";
import type { StartTaskPayload } from "../hooks/useStartTask";
import { useEditTimer } from "../hooks/useEditTimer";
import { usePauseTimer } from "../hooks/usePauseTimer";
import { useHiddenTasks } from "../hooks/useHiddenTasks";
import { useDeleteTimesheet } from "../hooks/useDeleteTimesheet";
import { useIdleDetection } from "../hooks/useIdleDetection";
import { setTrayTooltip, setTrayTitle, setTrayIcon, updateTrayMenu, registerShortcuts } from "../api/trayApi";
import { formatAcceleratorForDisplay } from "../settings/Controls";
import { useAppearance } from "../hooks/useAppearance";
import { useLanguageSync } from "../hooks/useLanguageSync";
import { useUpdater } from "../hooks/useUpdater";
import { updateTimesheet, stopTimesheet } from "../api/timesheetApi";
import { formatElapsed } from "../components/ActiveTimerCard";
import type { RecentTask } from "../types";

export default function TrayPopup() {
  const { t, i18n } = useTranslation();
  const qc = useQueryClient();
  const [showNewTask, setShowNewTask] = useState(false);
  const [idleProcessing, setIdleProcessing] = useState(false);
  const [focusTab, setFocusTab] = useState<"recent" | "today">("recent");
  const [recentCollapsed, setRecentCollapsed] = useState(false);
  const [todayCollapsed, setTodayCollapsed] = useState(false);

  useAppearance();
  useLanguageSync();

  useEffect(() => {
    const win = getCurrentWindow();
    const unlisten = win.listen("kimai://refresh", () => {
      qc.invalidateQueries({ queryKey: ["active-timesheets"] });
      qc.invalidateQueries({ queryKey: ["recent-timesheets"] });
      qc.invalidateQueries({ queryKey: ["today-timesheets"] });
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
    connections,
    activeConnectionId,
    switchConnection,
  } = useKimaiClient();
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
    pausedTimer,
    isPaused,
    pauseTimer,
    resumeTimer,
    fullStop,
    isPausing,
    isResuming,
    isStopping,
    pauseError,
    dismissPauseError,
  } = usePauseTimer(client, timer, baseUrl);

  const activeKey = timer ? `${timer.projectId}-${timer.activityId}` : null;
  const { tasks, isLoading: tasksLoading } = useRecentTasks(
    client,
    isConfigured,
    activeKey,
  );

  const today = useTodayTimesheets(client, isConfigured, refreshInterval);

  const { startTask, startingKey, switchError, dismissError, isStarting } =
    useStartTask(client, timer?.id ?? null, () => setShowNewTask(false));

  const { editTimer, isSaving, saveError } = useEditTimer(client);
  const { hiddenKeys, hideTask, clearAll: clearHidden } = useHiddenTasks();
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
  }, [idleState]);

  // Global shortcut: toggle timer
  const timerRef = useRef(timer);
  const clientRef = useRef(client);
  timerRef.current = timer;
  clientRef.current = client;

  useEffect(() => {
    const win = getCurrentWindow();
    const unlisten = win.listen("kimai://toggle-timer", async () => {
      const t = timerRef.current;
      const c = clientRef.current;
      if (t && c) {
        try { await stopTimesheet(c, t.id); } catch { /* best-effort */ }
      }
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
  useEffect(() => {
    if (idleState !== "returned" || idleSettings.idleAction === "ask") return;
    if (!client || !timer) return;

    const handle = async () => {
      setIdleProcessing(true);
      try {
        if (idleSettings.idleAction === "continue") {
          // Do nothing, just dismiss
        } else if (idleSettings.idleAction === "stop") {
          await stopTimesheet(client, timer.id);
        } else if (idleSettings.idleAction === "discard" && idleStartedAt) {
          await updateTimesheet(client, timer.id, {
            end: idleStartedAt.toISOString(),
          });
        }
      } catch {
        // Ignore errors for auto-actions
      } finally {
        setIdleProcessing(false);
        dismissIdle();
      }
    };
    handle();
  }, [idleState, idleSettings.idleAction]);

  const handleIdleContinue = useCallback(() => {
    dismissIdle();
  }, [dismissIdle]);

  const handleIdleStopAtStart = useCallback(async () => {
    if (!client || !timer || !idleStartedAt) return;
    setIdleProcessing(true);
    try {
      await updateTimesheet(client, timer.id, {
        end: idleStartedAt.toISOString(),
      });
    } catch {
      // fallback: just stop now
      try { await stopTimesheet(client, timer.id); } catch {}
    } finally {
      setIdleProcessing(false);
      dismissIdle();
    }
  }, [client, timer, idleStartedAt, dismissIdle]);

  const handleIdleStopNow = useCallback(async () => {
    if (!client || !timer) return;
    setIdleProcessing(true);
    try {
      await stopTimesheet(client, timer.id);
    } catch {}
    setIdleProcessing(false);
    dismissIdle();
  }, [client, timer, dismissIdle]);

  const handleIdleStopAndNew = useCallback(async () => {
    if (!client || !timer || !idleStartedAt) return;
    setIdleProcessing(true);
    try {
      await updateTimesheet(client, timer.id, {
        end: idleStartedAt.toISOString(),
      });
    } catch {
      try { await stopTimesheet(client, timer.id); } catch {}
    }
    setIdleProcessing(false);
    dismissIdle();
    setShowNewTask(true);
  }, [client, timer, idleStartedAt, dismissIdle]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (showNewTask) {
          setShowNewTask(false);
        } else {
          getCurrentWindow().hide();
        }
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [showNewTask]);

  // Update tray icon state
  useEffect(() => {
    if (status === "error" || status === "offline") {
      setTrayIcon("error");
    } else if (timer) {
      setTrayIcon("running");
    } else if (isPaused) {
      setTrayIcon("paused");
    } else {
      setTrayIcon("idle");
    }
  }, [status, !!timer, isPaused]);

  // Update tray tooltip and menu bar title
  useEffect(() => {
    if (isPaused && pausedTimer) {
      setTrayTooltip(`KimaiTray — ${t("pause.paused")} — ${pausedTimer.project}`);
      if (traySettings.menuBarLabelStyle !== "hidden") {
        setTrayTitle(t("pause.paused"));
      } else {
        setTrayTitle("");
      }
      return;
    }

    if (!timer) {
      setTrayTooltip("KimaiTray");
      setTrayTitle("");
      return;
    }
    const tick = () => {
      const secs = Math.max(
        0,
        Math.floor(Date.now() / 1000) - timer.beginSeconds,
      );
      const elapsed = formatElapsed(secs);
      const elapsedTray = formatElapsed(secs, traySettings.showSecondsInTimer);

      setTrayTooltip(`${timer.project} — ${timer.activity} — ${elapsed}`);

      const { menuBarLabelStyle } = traySettings;

      if (menuBarLabelStyle === "hidden") {
        setTrayTitle("");
        return;
      }

      if (menuBarLabelStyle === "timer") {
        setTrayTitle(elapsedTray);
      } else if (menuBarLabelStyle === "project") {
        setTrayTitle(timer.project);
      } else if (menuBarLabelStyle === "activity") {
        setTrayTitle(timer.activity);
      }
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => {
      clearInterval(id);
      setTrayTooltip("KimaiTray");
      setTrayTitle("");
    };
  }, [timer?.id, timer?.beginSeconds, timer?.project, timer?.activity, isPaused, pausedTimer, traySettings, t]);

  const visibleTasks = useMemo(
    () => tasks.filter((t) => !hiddenKeys.has(t.key)),
    [tasks, hiddenKeys],
  );

  const hiddenCount = hiddenKeys.size;

  const handleStartRecent = (task: RecentTask) => {
    startTask(
      {
        projectId: task.projectId,
        activityId: task.activityId,
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

  const handleNewTaskSubmit = (payload: StartTaskPayload) => {
    startTask(payload);
  };

  const compactTimer = popupLayout === "taskbar" || popupLayout === "timeline";

  const showIdleDialog =
    idleState === "returned" &&
    idleSettings.idleAction === "ask" &&
    timer &&
    idleStartedAt;

  return (
    <div className="relative flex h-screen w-screen flex-col bg-white dark:bg-[#1a1a1a] text-gray-900 dark:text-gray-100">
      <HeaderStatus
        status={status}
        errorMessage={errorMessage}
        connections={connections}
        activeConnectionId={activeConnectionId}
        onSwitchConnection={switchConnection}
      />

      {updater.available && (
        <button
          onClick={() => updater.install?.()}
          disabled={updater.downloading}
          className="mx-3 mt-1.5 flex items-center gap-2 rounded-md bg-[var(--accent)]/10 border border-[var(--accent)]/20 px-2.5 py-1.5 text-[11px] text-[var(--accent)] hover:bg-[var(--accent)]/15 transition-colors disabled:opacity-60"
        >
          {updater.downloading ? (
            <div className="h-3 w-3 animate-spin rounded-full border-2 border-[var(--accent)]/30 border-t-[var(--accent)]" />
          ) : (
            <svg className="h-3 w-3 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
            </svg>
          )}
          <span className="font-medium">{t("updateSettings.updateLabel", { version: updater.version })}</span>
        </button>
      )}

      {showNewTask && client ? (
        <NewTaskForm
          client={client}
          hasActiveTimer={!!timer}
          onSubmit={handleNewTaskSubmit}
          onCancel={() => setShowNewTask(false)}
          isSubmitting={isStarting}
          showNote={featureFlags.featureNote}
          showTags={featureFlags.featureTags}
          showCustomerSelect={featureFlags.featureCustomerSelect}
          showCustomStartTime={featureFlags.featureCustomStartTime}
        />
      ) : (
        <>
          {/* Timer area */}
          <div className={popupLayout === "focus" ? "timer-area" : undefined}>
            {status === "loading" ? (
              <EmptyTimerState variant="loading" compact={compactTimer} />
            ) : status === "unconfigured" ? (
              <EmptyTimerState variant="unconfigured" compact={compactTimer} />
            ) : timer ? (
              <ActiveTimerCard
                timer={timer}
                onStop={fullStop}
                onPause={pauseTimer}
                isStopping={isStopping}
                isPausing={isPausing}
                multipleActive={multipleActive}
                onEdit={editTimer}
                isSaving={isSaving}
                saveError={saveError}
                compact={compactTimer}
                focusMode={popupLayout === "focus"}
                showNote={featureFlags.featureNote}
                showTags={featureFlags.featureTags}
              />
            ) : isPaused && pausedTimer ? (
              <PausedTimerCard
                paused={pausedTimer}
                onResume={resumeTimer}
                onStop={fullStop}
                isResuming={isResuming}
                isStopping={isStopping}
                error={pauseError}
                onDismissError={dismissPauseError}
                compact={compactTimer}
              />
            ) : (
              <EmptyTimerState compact={compactTimer} />
            )}
          </div>

          {(switchError || (pauseError && timer) || timesheetDeleteError) && (
            <div className="mx-3 mt-1.5 flex items-start gap-2 rounded-md bg-red-50 dark:bg-red-950/30 border border-red-200/60 dark:border-red-800/40 px-2.5 py-2">
              <span className="text-[11px] text-red-600 dark:text-red-400 flex-1 leading-snug">
                {switchError || pauseError || timesheetDeleteError}
              </span>
              <button
                onClick={switchError ? dismissError : timesheetDeleteError ? dismissDeleteError : dismissPauseError}
                className="text-red-400 hover:text-red-600 dark:text-red-500 dark:hover:text-red-300 text-xs leading-none shrink-0 p-0.5"
              >
                ✕
              </button>
            </div>
          )}

          <div className="mx-3 mt-2 border-t border-gray-100 dark:border-gray-800" />

          {/* Scrollable content — layout-dependent */}
          <div className="flex-1 min-h-0 overflow-y-auto">
            {popupLayout === "focus" ? (
              <>
                {/* Tab bar */}
                <div className="mx-3 mt-1.5 mb-1 flex gap-1">
                  <button
                    onClick={() => setFocusTab("recent")}
                    className={`flex-1 rounded-md px-2 py-1 text-[10px] font-medium transition-colors focus:outline-none ${
                      focusTab === "recent"
                        ? "bg-[var(--accent)]/10 text-[var(--accent)]"
                        : "text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300"
                    }`}
                  >
                    {t("tray.recentTasks")}
                  </button>
                  <button
                    onClick={() => setFocusTab("today")}
                    className={`flex-1 rounded-md px-2 py-1 text-[10px] font-medium transition-colors focus:outline-none ${
                      focusTab === "today"
                        ? "bg-[var(--accent)]/10 text-[var(--accent)]"
                        : "text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300"
                    }`}
                  >
                    {t("today.title")}
                  </button>
                </div>
                {focusTab === "recent" ? (
                  <RecentTasksList
                    tasks={visibleTasks}
                    onStart={handleStartRecent}
                    onHide={handleHideRecent}
                    onDelete={handleDeleteRecent}
                    isLoading={status !== "unconfigured" && tasksLoading}
                    startingKey={startingKey}
                    deletingId={deletingId}
                    disabled={isStarting || isStopping || isPausing || isResuming}
                    hiddenCount={hiddenCount}
                    onShowAll={clearHidden}
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
                    />
                    <div className="mx-3 border-t border-gray-100 dark:border-gray-800" />
                  </>
                )}
                {/* Collapsible recent tasks */}
                <div className="mt-1.5">
                  <button
                    onClick={() => setRecentCollapsed(!recentCollapsed)}
                    className="w-full px-3 py-1.5 flex items-center justify-between"
                  >
                    <span className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500">
                      {t("tray.recentTasks")}
                    </span>
                    <svg
                      className={`h-3 w-3 text-gray-400 dark:text-gray-500 transition-transform ${recentCollapsed ? "" : "rotate-180"}`}
                      fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                    </svg>
                  </button>
                  {!recentCollapsed && (
                    <RecentTasksList
                      tasks={visibleTasks}
                      onStart={handleStartRecent}
                      onHide={handleHideRecent}
                      onDelete={handleDeleteRecent}
                      isLoading={status !== "unconfigured" && tasksLoading}
                      startingKey={startingKey}
                      deletingId={deletingId}
                      disabled={isStarting || isStopping || isPausing || isResuming}
                      hiddenCount={hiddenCount}
                      onShowAll={clearHidden}
                    />
                  )}
                </div>
              </>
            ) : popupLayout === "taskbar" ? (
              <>
                <RecentTasksList
                  tasks={visibleTasks}
                  onStart={handleStartRecent}
                  onHide={handleHideRecent}
                  onDelete={handleDeleteRecent}
                  isLoading={status !== "unconfigured" && tasksLoading}
                  startingKey={startingKey}
                  deletingId={deletingId}
                  disabled={isStarting || isStopping || isPausing || isResuming}
                  hiddenCount={hiddenCount}
                  onShowAll={clearHidden}
                />
                {status !== "unconfigured" && (
                  <>
                    <div className="mx-3 border-t border-gray-100 dark:border-gray-800" />
                    {/* Collapsible today section */}
                    <div className="mt-1.5">
                      <button
                        onClick={() => setTodayCollapsed(!todayCollapsed)}
                        className="w-full px-3 py-1.5 flex items-center justify-between"
                      >
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500">
                            {t("today.title")}
                          </span>
                          {today.totalCount > 0 && (
                            <span className="text-[10px] tabular-nums text-gray-400 dark:text-gray-500">
                              {today.totalDuration > 0 && `${Math.floor(today.totalDuration / 3600)}h ${Math.floor((today.totalDuration % 3600) / 60)}m`}
                            </span>
                          )}
                        </div>
                        <svg
                          className={`h-3 w-3 text-gray-400 dark:text-gray-500 transition-transform ${todayCollapsed ? "" : "rotate-180"}`}
                          fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
                        >
                          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                        </svg>
                      </button>
                      {!todayCollapsed && (
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
                        />
                      )}
                    </div>
                  </>
                )}
              </>
            ) : (
              /* Classic layout */
              <>
                <RecentTasksList
                  tasks={visibleTasks}
                  onStart={handleStartRecent}
                  onHide={handleHideRecent}
                  onDelete={handleDeleteRecent}
                  isLoading={status !== "unconfigured" && tasksLoading}
                  startingKey={startingKey}
                  deletingId={deletingId}
                  disabled={isStarting || isStopping || isPausing || isResuming}
                  hiddenCount={hiddenCount}
                  onShowAll={clearHidden}
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
                    />
                  </>
                )}
              </>
            )}
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
        />
      )}
    </div>
  );
}
