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
import NewTaskForm from "../components/NewTaskForm";
import CategoryModePanel from "../categorymode/CategoryModePanel";
import IdleDialog from "../components/IdleDialog";
import ApiErrorDialog from "../components/ApiErrorDialog";
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
import { updateTimesheet, stopTimesheet } from "../api/timesheetApi";
import type { RecentTask, FavoriteTask } from "../types";
import type { ExternalIssue } from "../integrations/issues/types";
import { createIssueProvider } from "../integrations/issues/issueProvider";
import { logger } from "../utils/logger";

const isMac = navigator.platform.toUpperCase().includes("MAC");

// localStorage key for the linked issue ↔ active timer association, used to
// restore the time-estimate badge after a popup reload or app restart.
const LINKED_ISSUE_KEY = "kimai:linkedIssue";

// localStorage key for a best-effort map of task identity (projectId-activityId)
// → last linked issue. Recents/favorites carry no issue reference, so this lets
// the time-estimate badge reappear when such a task is started.
const LINKED_ISSUE_BY_KEY = "kimai:linkedIssueByKey";

const taskKeyOf = (projectId: number, activityId: number) =>
  `${projectId}-${activityId}`;

function readLinkedIssueMap(): Record<string, ExternalIssue> {
  try {
    const raw = localStorage.getItem(LINKED_ISSUE_BY_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function storeLinkedIssueForTask(key: string, issue: ExternalIssue) {
  try {
    const map = readLinkedIssueMap();
    map[key] = issue;
    localStorage.setItem(LINKED_ISSUE_BY_KEY, JSON.stringify(map));
  } catch {
    /* storage unavailable — non-fatal */
  }
}

function TrafficLight({ color, hoverColor, onClick, children }: {
  color: string; hoverColor: string; onClick: () => void; children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="group h-3 w-3 rounded-full flex items-center justify-center transition-colors focus:outline-none"
      style={{ backgroundColor: color }}
      onMouseEnter={(e) => { (e.currentTarget.style.backgroundColor) = hoverColor; }}
      onMouseLeave={(e) => { (e.currentTarget.style.backgroundColor) = color; }}
    >
      <span className="hidden group-hover:block text-[8px] leading-none font-bold text-black/50">
        {children}
      </span>
    </button>
  );
}

function DetachedTitleBar({ pinned, onTogglePin, pinLabel, transparent }: {
  pinned: boolean; onTogglePin: () => void; pinLabel: string; transparent?: boolean;
}) {
  const win = getCurrentWindow();
  const barBg = transparent
    ? "bg-white/30 dark:bg-black/20 backdrop-blur-sm"
    : "bg-gray-50/80 dark:bg-[#141414]";

  const pinButton = (
    <button
      type="button"
      onClick={onTogglePin}
      title={pinLabel}
      className={`rounded p-1 transition-colors focus:outline-none focus-visible:ring-1 focus-visible:ring-[var(--accent)]
        ${pinned
          ? "text-[var(--accent)] bg-[var(--accent)]/10"
          : "text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300"
        }`}
    >
      <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        {pinned ? (
          <path strokeLinecap="round" strokeLinejoin="round" d="M16 4v4l2 2v2h-5l-1 8-1-8H6v-2l2-2V4a1 1 0 011-1h6a1 1 0 011 1z" />
        ) : (
          <path strokeLinecap="round" strokeLinejoin="round" d="M16 4v4l2 2v2h-5l-1 8-1-8H6v-2l2-2V4a1 1 0 011-1h6a1 1 0 011 1z" opacity={0.5} />
        )}
      </svg>
    </button>
  );

  if (isMac) {
    return (
      <div
        data-tauri-drag-region
        className={`relative flex h-8 shrink-0 items-center border-b border-gray-100 dark:border-gray-800 ${barBg} px-2.5 select-none`}
      >
        <div className="flex items-center gap-1.5">
          <TrafficLight color="#ff5f57" hoverColor="#ff3b30" onClick={() => win.hide()}>✕</TrafficLight>
          <TrafficLight color="#febc2e" hoverColor="#f0a000" onClick={() => win.minimize()}>−</TrafficLight>
          <TrafficLight color="#28c840" hoverColor="#1aab29" onClick={() => win.toggleMaximize()}>+</TrafficLight>
        </div>
        <span
          data-tauri-drag-region
          className="absolute inset-0 flex items-center justify-center text-[10px] font-medium text-gray-400 dark:text-gray-500 pointer-events-none"
        >
          KimaiTray
        </span>
        <div className="ml-auto">{pinButton}</div>
      </div>
    );
  }

  return (
    <div
      data-tauri-drag-region
      className={`flex h-8 shrink-0 items-center justify-between border-b border-gray-100 dark:border-gray-800 ${barBg} px-2 select-none`}
    >
      <span
        data-tauri-drag-region
        className="text-[10px] font-medium text-gray-400 dark:text-gray-500 pointer-events-none"
      >
        KimaiTray
      </span>
      <div className="flex items-center gap-0.5">
        {pinButton}
        <button
          type="button"
          onClick={() => win.minimize()}
          className="rounded p-1 text-gray-400 hover:text-gray-600 hover:bg-gray-200/60 dark:text-gray-500 dark:hover:text-gray-300 dark:hover:bg-gray-700/60 transition-colors focus:outline-none"
        >
          <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" d="M5 12h14" />
          </svg>
        </button>
        <button
          type="button"
          onClick={() => win.toggleMaximize()}
          className="rounded p-1 text-gray-400 hover:text-gray-600 hover:bg-gray-200/60 dark:text-gray-500 dark:hover:text-gray-300 dark:hover:bg-gray-700/60 transition-colors focus:outline-none"
        >
          <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
            <rect x="5" y="5" width="14" height="14" rx="1" />
          </svg>
        </button>
        <button
          type="button"
          onClick={() => win.hide()}
          className="rounded p-1 text-gray-400 hover:text-red-500 hover:bg-red-100/60 dark:text-gray-500 dark:hover:text-red-400 dark:hover:bg-red-900/40 transition-colors focus:outline-none"
        >
          <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
    </div>
  );
}

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

  const { startTask, startingKey, switchError, dismissError, isStarting } =
    useStartTask(client, () => setShowNewTask(false));

  const { editTimer, isSaving, saveError } = useEditTimer(client);
  const { hiddenKeys, hideTask, clearAll: clearHidden } = useHiddenTasks();
  const { favorites, addFavorite: addFav, removeFavorite: removeFav, isFavorite } = useFavorites(baseUrl);
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
  }, [idleState]);

  const linkedIssueRef = useRef<ExternalIssue | null>(null);
  // State mirror of the linked issue so the active timer card can show its
  // time estimate. Set when an issue is linked, cleared when the timer stops.
  const [linkedIssue, setLinkedIssue] = useState<ExternalIssue | null>(null);
  const prevTimerIdRef = useRef<number | null>(null);
  const prevTimerBeginRef = useRef<number | null>(null);

  useEffect(() => {
    const prevId = prevTimerIdRef.current;
    const prevBegin = prevTimerBeginRef.current;

    prevTimerIdRef.current = timer?.id ?? null;
    prevTimerBeginRef.current = timer?.beginSeconds ?? null;

    // Drop the estimate badge once no timer is running.
    if (timer == null) setLinkedIssue(null);

    if (prevId != null && (timer == null || timer.id !== prevId) && linkedIssueRef.current) {
      const issue = linkedIssueRef.current;
      linkedIssueRef.current = null;

      if (issueIntegration.syncTime && issueIntegration.enabled && issueToken && prevBegin != null) {
        const durationSeconds = Math.floor(Date.now() / 1000) - prevBegin;
        const provider = createIssueProvider(issueIntegration, issueToken);
        if (provider.addSpentTime) {
          provider.addSpentTime(issue.id, durationSeconds).catch(() => {
            logger.error("Failed to sync spent time to issue provider");
          });
        }
      }
    }
  }, [timer?.id, timer?.beginSeconds, issueIntegration, issueToken]);

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
          invalidateTimesheets(qc);
        } else if (idleSettings.idleAction === "discard" && idleStartedAt) {
          await updateTimesheet(client, timer.id, {
            end: idleStartedAt.toISOString(),
          });
          invalidateTimesheets(qc);
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
      invalidateTimesheets(qc);
    } catch {
      // fallback: just stop now
      try {
        await stopTimesheet(client, timer.id);
        invalidateTimesheets(qc);
      } catch {}
    } finally {
      setIdleProcessing(false);
      dismissIdle();
    }
  }, [client, timer, idleStartedAt, dismissIdle, qc]);

  const handleIdleStopNow = useCallback(async () => {
    if (!client || !timer) return;
    setIdleProcessing(true);
    try {
      await stopTimesheet(client, timer.id);
      invalidateTimesheets(qc);
    } catch {
      // stop failed, still dismiss
    } finally {
      setIdleProcessing(false);
      dismissIdle();
    }
  }, [client, timer, dismissIdle, qc]);

  const handleIdleStopAndNew = useCallback(async () => {
    if (!client || !timer || !idleStartedAt) return;
    setIdleProcessing(true);
    try {
      await updateTimesheet(client, timer.id, {
        end: idleStartedAt.toISOString(),
      });
      invalidateTimesheets(qc);
    } catch {
      try {
        await stopTimesheet(client, timer.id);
        invalidateTimesheets(qc);
      } catch {}
    } finally {
      setIdleProcessing(false);
      dismissIdle();
    }
    setShowNewTask(true);
  }, [client, timer, idleStartedAt, dismissIdle, qc]);

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
  }, [status, !!timer, hasPausedTimers]);

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
  }, [timer?.id, timer?.beginSeconds, timer?.project, timer?.activity, hasPausedTimers, pausedTimers, traySettings, t]);

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

  const handleNewTaskSubmit = (payload: StartTaskPayload) => {
    startTask(payload);
  };

  const handleIssueLinked = useCallback((issue: ExternalIssue | null) => {
    linkedIssueRef.current = issue;
    setLinkedIssue(issue);
  }, []);

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
    try {
      localStorage.setItem(
        LINKED_ISSUE_KEY,
        JSON.stringify({ timerId: timer.id, issue: linkedIssue }),
      );
    } catch {
      /* storage unavailable — non-fatal */
    }
    // Also remember the issue by task identity so the estimate can be restored
    // when the same project+activity is later started from recents/favorites,
    // which don't embed the issue URL in their description.
    storeLinkedIssueForTask(
      taskKeyOf(timer.projectId, timer.activityId),
      linkedIssue,
    );
  }, [timer?.id, linkedIssue]);

  // When the in-memory link is gone (after a reload/restart), restore it for
  // the running timer from localStorage and/or the issue URL in the
  // description, then refresh the time stats straight from GitLab.
  const [fetchedIssue, setFetchedIssue] = useState<ExternalIssue | null>(null);

  useEffect(() => {
    if (linkedIssue || !estimateEnabled || !timer || !issueToken) {
      setFetchedIssue(null);
      return;
    }

    let storedIssue: ExternalIssue | null = null;
    try {
      const raw = localStorage.getItem(LINKED_ISSUE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as { timerId?: number; issue?: ExternalIssue };
        if (parsed?.timerId === timer.id && parsed.issue) storedIssue = parsed.issue;
      }
    } catch {
      /* ignore malformed storage */
    }

    // Fall back to the per-task association (project+activity). This is what
    // makes the badge appear for timers started from recents/favorites: they
    // have no stored timerId match and usually no issue URL in the description.
    if (!storedIssue) {
      const byKey = readLinkedIssueMap()[
        taskKeyOf(timer.projectId, timer.activityId)
      ];
      if (byKey) storedIssue = byKey;
    }

    const url = storedIssue?.webUrl ?? timerIssueUrl;
    const provider = createIssueProvider(issueIntegration, issueToken);
    if (!url || !provider.fetchIssueByUrl) {
      setFetchedIssue(storedIssue);
      return;
    }

    let cancelled = false;
    provider
      .fetchIssueByUrl(url)
      .then((issue) => {
        if (!cancelled) setFetchedIssue(issue ?? storedIssue);
      })
      .catch(() => {
        if (!cancelled) setFetchedIssue(storedIssue);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [linkedIssue, estimateEnabled, timer?.id, timerIssueUrl, issueToken]);

  const estimateIssue = linkedIssue ?? fetchedIssue;
  const showIssueEstimate = estimateEnabled && estimateIssue?.timeEstimate != null;

  const compactTimer = popupLayout === "taskbar" || popupLayout === "timeline";

  const showIdleDialog =
    !!client &&
    idleState === "returned" &&
    idleSettings.idleAction === "ask" &&
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
          showIssuePicker={issueIntegration.enabled}
          issueIntegrationConfig={issueIntegration}
          issueToken={issueToken}
          onIssueLinked={handleIssueLinked}
        />
      ) : (
        <>
          <div className="flex flex-1 min-h-0 flex-col">
            {/* Timer area */}
            <div className="timer-area max-h-[50%] min-h-0 shrink-0 overflow-y-auto overscroll-contain">
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
              ) : !hasPausedTimers ? (
                <EmptyTimerState compact={compactTimer} />
              ) : null}
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
                  compact={!!timer || compactTimer}
                  colorMode={colorMode}
                  showDescriptionOnHover={
                    featureFlags.featurePausedTimerDescriptionHover
                  }
                />
              ))}
            </div>

            {(switchError || pauseError || timesheetDeleteError) && (
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
            <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain">
            {featureFlags.featureCategoryMode && client ? (
              <>
                <CategoryModePanel
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
                {/* Tab bar */}
                <div className="sticky top-0 z-10 bg-white/95 py-1.5 backdrop-blur-sm dark:bg-[#1a1a1a]/95">
                  <div className="mx-3 flex gap-1">
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
                </div>
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
                  )}
                </div>
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
                          colorMode={colorMode}
                        />
                      )}
                    </div>
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
        />
      )}
    </div>
  );
}
