// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import TrayPopup from "./TrayPopup";

const mocks = vi.hoisted(() => ({
  kimai: {} as any,
  active: {} as any,
  pause: {} as any,
  recent: {} as any,
  today: {} as any,
  hidden: {} as any,
  favorite: {} as any,
  idle: {} as any,
  updater: {} as any,
  startTask: vi.fn(),
  startSuccess: null as null | ((entry: any, payload: any) => void),
  startError: null as null | ((error: any, payload: any) => void),
  editTimer: vi.fn(),
  editTimesheet: vi.fn(),
  deleteEntry: vi.fn(),
  events: new Map<string, (event?: any) => void>(),
  deepLinkHandler: null as null | ((url: string) => void),
  deepRequest: {} as any,
  resolveConnection: null as string | null,
  windowHide: vi.fn(),
  windowListen: vi.fn(),
  settingsShow: vi.fn(),
  settingsFocus: vi.fn(),
  queryClient: {},
  invalidate: vi.fn(),
  tray: {
    open: vi.fn(), register: vi.fn(), always: vi.fn(), icon: vi.fn(), title: vi.fn(), tooltip: vi.fn(),
    tickerStart: vi.fn(), tickerStop: vi.fn(), menu: vi.fn(),
  },
  reminder: { show: vi.fn(), update: vi.fn(), hide: vi.fn() },
  timesheet: { get: vi.fn(), update: vi.fn(), stop: vi.fn() },
  changelog: { claim: vi.fn(), remember: vi.fn(), show: vi.fn() },
  getVersion: vi.fn(),
  loggerError: vi.fn(),
  issueProvider: {} as any,
  linked: { readSelection: vi.fn(), readMap: vi.fn(), storeTask: vi.fn(), storeTimer: vi.fn() },
  notification: vi.fn(),
}));

vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (key: string) => key, i18n: { language: "en" } }) }));
vi.mock("@tanstack/react-query", () => ({ useQueryClient: () => mocks.queryClient }));
vi.mock("@tauri-apps/api/app", () => ({ getVersion: mocks.getVersion }));
vi.mock("@tauri-apps/api/window", () => ({
  getCurrentWindow: () => ({
    listen: (name: string, cb: (event?: any) => void) => {
      mocks.events.set(name, cb);
      mocks.windowListen(name);
      return Promise.resolve(vi.fn());
    },
    hide: mocks.windowHide,
  }),
  Window: { getByLabel: vi.fn(() => Promise.resolve({ show: mocks.settingsShow, setFocus: mocks.settingsFocus })) },
}));
vi.mock("@tauri-apps/plugin-notification", () => ({ sendNotification: mocks.notification }));

vi.mock("../hooks/useKimaiClient", () => ({ useKimaiClient: () => mocks.kimai }));
vi.mock("../hooks/useActiveTimer", () => ({ useActiveTimer: () => mocks.active }));
vi.mock("../hooks/usePauseTimer", () => ({ usePauseTimer: () => mocks.pause }));
vi.mock("../hooks/useRecentTasks", () => ({ useRecentTasks: () => mocks.recent }));
vi.mock("../hooks/useTodayTimesheets", () => ({ useTodayTimesheets: () => mocks.today }));
vi.mock("../hooks/useStartTask", () => ({
  useStartTask: (_client: any, success: any, error: any) => {
    mocks.startSuccess = success;
    mocks.startError = error;
    return { startTask: mocks.startTask, startingKey: null, switchError: mocks.kimai.switchError ?? null, dismissError: mocks.kimai.dismissSwitchError, isStarting: mocks.kimai.isStarting ?? false };
  },
}));
vi.mock("../hooks/useEditTimer", () => ({ useEditTimer: () => ({ editTimer: mocks.editTimer, isSaving: false, saveError: null }) }));
vi.mock("../hooks/useEditTimesheet", () => ({ useEditTimesheet: () => ({ editTimesheet: mocks.editTimesheet }) }));
vi.mock("../hooks/useHiddenTasks", () => ({ useHiddenTasks: () => mocks.hidden }));
vi.mock("../hooks/useFavorites", () => ({ useFavorites: () => mocks.favorite }));
vi.mock("../hooks/useKimaiTags", () => ({ useKimaiTags: () => ["tag"] }));
vi.mock("../hooks/useDeleteTimesheet", () => ({ useDeleteTimesheet: () => ({ deleteEntry: mocks.deleteEntry, deletingId: null, deleteError: mocks.kimai.deleteError ?? null, dismissError: mocks.kimai.dismissDeleteError }) }));
vi.mock("../hooks/useIdleDetection", () => ({ useIdleDetection: () => mocks.idle }));
vi.mock("../hooks/useNoTimerReminder", () => ({ useNoTimerReminder: vi.fn() }));
vi.mock("../hooks/useAppearance", () => ({ useAppearance: vi.fn() }));
vi.mock("../hooks/useLanguageSync", () => ({ useLanguageSync: vi.fn() }));
vi.mock("../hooks/useUpdater", () => ({ useUpdater: () => mocks.updater }));
vi.mock("../hooks/invalidateTimesheets", () => ({ invalidateTimesheets: (...args: any[]) => mocks.invalidate(...args) }));

vi.mock("../api/trayApi", () => ({
  openKimaiInBrowser: mocks.tray.open,
  registerShortcuts: mocks.tray.register,
  setAlwaysOnTop: mocks.tray.always,
  setTrayIcon: mocks.tray.icon,
  setTrayTitle: mocks.tray.title,
  setTrayTooltip: mocks.tray.tooltip,
  startTrayTicker: mocks.tray.tickerStart,
  stopTrayTicker: mocks.tray.tickerStop,
  updateTrayMenu: mocks.tray.menu,
}));
vi.mock("../api/timesheetApi", () => ({ getTimesheet: mocks.timesheet.get, updateTimesheet: mocks.timesheet.update, stopTimesheet: mocks.timesheet.stop }));
vi.mock("../api/reminderWindow", () => ({
  hideFullscreenReminder: mocks.reminder.hide,
  showFullscreenReminder: mocks.reminder.show,
  updateFullscreenReminder: mocks.reminder.update,
  IDLE_REMINDER_ACTION_EVENT: "idle-action",
}));
vi.mock("../api/changelog", () => ({ claimInstalledChangelog: mocks.changelog.claim, rememberPendingChangelog: mocks.changelog.remember }));
vi.mock("../api/changelogWindow", () => ({ showChangelogWindow: mocks.changelog.show }));
vi.mock("../api/deepLink", () => ({ subscribeToDeepLinks: (cb: (url: string) => void) => { mocks.deepLinkHandler = cb; return vi.fn(); } }));
vi.mock("../api/deepLinkPayload", () => ({
  parseKimaiTrayDeepLink: (url: string) => { if (url === "bad") throw new Error("invalid deep link"); return mocks.deepRequest; },
  resolveDeepLinkConnectionId: () => mocks.resolveConnection,
}));
vi.mock("../integrations/issues/issueProvider", () => ({ createIssueProvider: () => mocks.issueProvider }));
vi.mock("../integrations/issues/linkedIssueStore", () => ({
  readLinkedIssueSelectionForTimer: mocks.linked.readSelection,
  readLinkedIssueMap: mocks.linked.readMap,
  storeLinkedIssueForTask: mocks.linked.storeTask,
  storeLinkedIssueForTimer: mocks.linked.storeTimer,
  taskKeyOf: (p: number, a: number) => `${p}-${a}`,
}));
vi.mock("../plugins/customInputs", () => ({
  DESCRIPTION_INPUT_TARGET: "description",
  getEnabledPluginCustomInputs: (flags: any) => flags.inputs ?? [],
  pickPluginMetadata: (metadata: any) => metadata,
}));
vi.mock("../utils/logger", () => ({ logger: { error: mocks.loggerError } }));
vi.mock("../utils/timesheetDuration", () => ({ getRecordedDurationSeconds: (entry: any) => entry.duration }));
vi.mock("../utils/time", () => ({ toKimaiLocal: () => "2026-01-01T10:00:00" }));
vi.mock("../settings/Controls", () => ({ formatAcceleratorForDisplay: (value: string) => `display:${value}` }));

vi.mock("../components/HeaderStatus", () => ({ default: ({ onSwitchConnection, onOpenKimai }: any) => <div data-testid="header"><button onClick={() => onSwitchConnection("other")}>switch</button><button onClick={onOpenKimai}>open-kimai</button></div> }));
vi.mock("../components/ActiveTimerCard", () => ({ default: ({ onStop, onPause, onEdit, onEditDescriptionRequestHandled }: any) => <div data-testid="active"><button onClick={onStop}>active-stop</button><button onClick={onPause}>active-pause</button><button onClick={onEdit}>active-edit</button><button onClick={onEditDescriptionRequestHandled}>note-handled</button></div> }));
vi.mock("../components/PausedTimerCard", () => ({ default: ({ paused, onResume, onStop, onDismissError }: any) => <div><button onClick={onResume}>resume-{paused.id}</button><button onClick={onStop}>discard-{paused.id}</button><button onClick={onDismissError}>pause-dismiss</button></div> }));
vi.mock("../components/EmptyTimerState", () => ({ default: ({ variant = "empty" }: any) => <div>empty-{variant}</div> }));
vi.mock("../components/RecentTasksList", () => ({ default: ({ tasks, onStart, onHide, onDelete, onToggleFavorite, onShowAll }: any) => <div data-testid="recent">{tasks[0] && <><button onClick={() => onStart(tasks[0])}>recent-start</button><button onClick={() => onHide(tasks[0])}>recent-hide</button><button onClick={() => onDelete(tasks[0])}>recent-delete</button><button onClick={() => onToggleFavorite(tasks[0])}>recent-favorite</button></>}<button onClick={onShowAll}>show-all</button></div> }));
vi.mock("../components/FavoriteTasksList", () => ({ default: ({ tasks, onStart, onRemove }: any) => <div data-testid="favorites">{tasks[0] && <><button onClick={() => onStart(tasks[0])}>favorite-start</button><button onClick={() => onRemove(tasks[0])}>favorite-remove</button></>}</div> }));
vi.mock("../components/PopupFooterActions", () => ({ default: ({ onNewTask, onSettings }: any) => <footer><button onClick={onNewTask}>new-task</button><button onClick={onSettings}>settings</button></footer> }));
vi.mock("../components/TrayFeedback", () => ({
  ErrorBanner: ({ message, onDismiss }: any) => <div data-testid="error">{message}<button onClick={onDismiss}>error-dismiss</button></div>,
  UpdateBanner: ({ onInstall }: any) => <button onClick={onInstall}>install-update</button>,
}));
vi.mock("../components/TrayLayoutControls", () => ({
  CollapsibleTraySection: ({ title, onToggle, children }: any) => <section><button onClick={onToggle}>{title}</button>{children}</section>,
  FocusTabs: ({ onChange }: any) => <button onClick={() => onChange("today")}>focus-today</button>,
}));
vi.mock("../components/NewTaskForm", () => ({ default: ({ onSubmit, onCancel, initialValues }: any) => <div data-testid="new-form">{JSON.stringify(initialValues)}<button onClick={() => onSubmit({ projectId: 10, activityId: 20, label: "New" }, null)}>submit-new</button><button onClick={onCancel}>cancel-new</button></div> }));
vi.mock("../categorymode/CategoryModePanel", () => ({ default: () => <div>category-panel</div> }));
vi.mock("../components/TodaySection", () => ({ default: ({ entries, onToggleExpand, onToggleSort, onRetry, onEditEntry }: any) => <div data-testid="today"><button onClick={onToggleExpand}>today-expand</button><button onClick={onToggleSort}>today-sort</button><button onClick={onRetry}>today-retry</button>{entries[0] && <button onClick={() => onEditEntry(entries[0])}>today-edit</button>}</div> }));
vi.mock("../components/TimesheetEditDialog", () => ({ default: ({ onSave, onClose }: any) => <div data-testid="edit-dialog"><button onClick={() => onSave({})}>edit-save</button><button onClick={onClose}>edit-close</button></div> }));
vi.mock("../components/DetachedTitleBar", () => ({ default: ({ onTogglePin, pinLabel }: any) => <button onClick={onTogglePin}>{pinLabel}</button> }));
vi.mock("../components/ApiErrorDialog", () => ({ default: () => <div>api-dialog</div> }));

const task = { key: "10-20", projectId: 10, activityId: 20, project: "Project", activity: "Activity", description: "desc", tags: ["tag"], timesheetId: 50, metadata: { field: "value" } };
const timer = { id: 7, projectId: 10, activityId: 20, project: "Project", activity: "Activity", description: "https://git.test/issues/1", beginSeconds: 100 };

beforeEach(() => {
  vi.clearAllMocks();
  mocks.events.clear();
  mocks.deepLinkHandler = null;
  mocks.resolveConnection = null;
  mocks.kimai = {
    client: { connectionId: "conn", cacheScope: "conn" }, settingsReady: true, isConfigured: true,
    refreshInterval: 60, baseUrl: "https://kimai.test", openKimaiInBrowser: true,
    idleSettings: { enableIdleDetection: true, idleThresholdMinutes: 5, idleAction: "ask", showIdleNotification: false },
    timerReminderSettings: { enabled: false, thresholdMinutes: 15 },
    traySettings: { menuBarLabelStyle: "timer", showSecondsInTimer: true },
    shortcutSettings: { shortcutTogglePopup: "Ctrl+K", shortcutStartStopTimer: "", shortcutNewTask: "", shortcutPauseResume: "", shortcutContinueLastTask: "", shortcutEditNote: "", shortcutOpenKimai: "", shortcutOpenSettings: "" },
    featureFlags: { featureNote: true, featureTags: true, featureCustomerSelect: true, featureCustomStartTime: true, featureDailyGoal: true, dailyGoalMinutes: 450, fullDailyGoalMinutes: 480, featureCategoryMode: false, featurePausedTimerDescriptionHover: true },
    pluginFlags: { inputs: [] }, autoUpdate: true, popupLayout: "classic", colorMode: "kimai", displayMode: "tray",
    connections: [{ id: "conn" }, { id: "other" }], activeConnectionId: "conn", switchConnection: vi.fn().mockResolvedValue(undefined),
    issueIntegration: { enabled: false, baseUrl: "", provider: "gitlab", autoInsertUrl: false, syncTime: false }, issueToken: "",
    dismissSwitchError: vi.fn(), dismissDeleteError: vi.fn(),
  };
  mocks.active = { timer: null, multipleActive: false, status: "connected", errorMessage: null };
  mocks.pause = { pausedTimers: [], hasPausedTimers: false, pauseTimer: vi.fn(), resumeTimer: vi.fn(), discardPausedTimer: vi.fn(), stopActiveTimer: vi.fn(), isPausing: false, resumingId: null, discardingId: null, isStoppingActive: false, pauseError: null, dismissPauseError: vi.fn() };
  mocks.recent = { tasks: [task], isLoading: false };
  mocks.today = { entries: [{ id: 1 }], totalCount: 1, totalDuration: 3660, hasMore: false, expanded: false, setExpanded: vi.fn(), sortAsc: false, setSortAsc: vi.fn(), isLoading: false, isError: false, refetch: vi.fn() };
  mocks.hidden = { hiddenKeys: new Set<string>(), hideTask: vi.fn(), clearAll: vi.fn() };
  mocks.favorite = { favorites: [{ ...task, key: "fav" }], addFavorite: vi.fn(), removeFavorite: vi.fn(), isFavorite: vi.fn(() => false) };
  mocks.idle = { idleState: "active", idleStartedAt: null, idleDurationSeconds: 0, dismissIdle: vi.fn() };
  mocks.updater = { available: false, downloading: false, version: null, install: vi.fn() };
  mocks.startTask.mockResolvedValue({ id: 99 });
  mocks.tray.register.mockResolvedValue(undefined);
  mocks.tray.open.mockResolvedValue(undefined);
  mocks.getVersion.mockResolvedValue("1.0.0");
  mocks.changelog.claim.mockReturnValue(null);
  mocks.changelog.show.mockResolvedValue(true);
  mocks.reminder.show.mockResolvedValue(true);
  mocks.reminder.update.mockResolvedValue(undefined);
  mocks.reminder.hide.mockResolvedValue(undefined);
  mocks.timesheet.stop.mockResolvedValue(undefined);
  mocks.timesheet.update.mockResolvedValue(undefined);
  mocks.timesheet.get.mockResolvedValue({ duration: 120 });
  mocks.issueProvider = { fetchIssueByUrl: vi.fn().mockResolvedValue(null), addSpentTime: vi.fn().mockResolvedValue(undefined) };
  mocks.linked.readSelection.mockReturnValue(undefined);
  mocks.linked.readMap.mockReturnValue({});
  class ResizeObserverMock { observe() {} disconnect() {} }
  vi.stubGlobal("ResizeObserver", ResizeObserverMock);
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe("TrayPopup", () => {
  it("renders the classic workflow and wires task, tray and window actions", async () => {
    const user = userEvent.setup();
    render(<TrayPopup />);
    await user.click(screen.getByRole("button", { name: "recent-start" }));
    await user.click(screen.getByRole("button", { name: "recent-hide" }));
    await user.click(screen.getByRole("button", { name: "recent-delete" }));
    await user.click(screen.getByRole("button", { name: "recent-favorite" }));
    await user.click(screen.getByRole("button", { name: "favorite-start" }));
    await user.click(screen.getByRole("button", { name: "favorite-remove" }));
    await user.click(screen.getByRole("button", { name: "show-all" }));
    await user.click(screen.getByRole("button", { name: "open-kimai" }));
    await user.click(screen.getByRole("button", { name: "switch" }));
    await user.click(screen.getByRole("button", { name: "settings" }));
    await waitFor(() => expect(mocks.settingsFocus).toHaveBeenCalled());
    expect(mocks.startTask).toHaveBeenCalledTimes(2);
    expect(mocks.hidden.hideTask).toHaveBeenCalledWith(task.key);
    expect(mocks.deleteEntry).toHaveBeenCalledWith(50);
    expect(mocks.favorite.addFavorite).toHaveBeenCalled();
    expect(mocks.favorite.removeFavorite).toHaveBeenCalledWith("fav");
    expect(mocks.tray.menu).toHaveBeenCalled();
    expect(mocks.tray.icon).toHaveBeenCalledWith("idle");
  });

  it("opens, submits, cancels and escapes from the new-task form", async () => {
    const user = userEvent.setup();
    render(<TrayPopup />);
    await user.click(screen.getByRole("button", { name: "new-task" }));
    await user.click(screen.getByRole("button", { name: "submit-new" }));
    expect(mocks.startTask).toHaveBeenCalledWith({ projectId: 10, activityId: 20, label: "New" });
    const lastStartCall = mocks.startTask.mock.calls[mocks.startTask.mock.calls.length - 1];
    mocks.startSuccess?.({ id: 99 }, lastStartCall?.[0]);
    await waitFor(() => expect(screen.queryByTestId("new-form")).toBeNull());
    await user.click(screen.getByRole("button", { name: "new-task" }));
    await user.click(screen.getByRole("button", { name: "cancel-new" }));
    await user.click(screen.getByRole("button", { name: "new-task" }));
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByTestId("new-form")).toBeNull();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(mocks.windowHide).toHaveBeenCalled();
  });

  it("handles active, paused and detached timer controls and native shortcuts", async () => {
    const user = userEvent.setup();
    mocks.active.timer = timer;
    mocks.pause.pausedTimers = [{ id: 1, project: "Old", pausedAt: 10 }, { id: 2, project: "New", pausedAt: 20 }];
    mocks.pause.hasPausedTimers = true;
    mocks.kimai.displayMode = "detached";
    mocks.updater = { available: true, downloading: false, version: "2", install: vi.fn() };
    render(<TrayPopup />);
    await user.click(screen.getByRole("button", { name: "active-stop" }));
    await user.click(screen.getByRole("button", { name: "active-pause" }));
    await user.click(screen.getByRole("button", { name: "active-edit" }));
    await user.click(screen.getByRole("button", { name: "resume-1" }));
    await user.click(screen.getByRole("button", { name: "discard-2" }));
    await user.click(screen.getByRole("button", { name: "detached.pin" }));
    await user.click(screen.getByRole("button", { name: "install-update" }));
    mocks.events.get("kimai://toggle-timer")?.();
    mocks.events.get("kimai://pause-resume-timer")?.();
    mocks.events.get("kimai://continue-last-task")?.();
    mocks.events.get("kimai://edit-active-note")?.();
    expect(mocks.pause.stopActiveTimer).toHaveBeenCalledTimes(2);
    expect(mocks.pause.pauseTimer).toHaveBeenCalledTimes(2);
    expect(mocks.pause.resumeTimer).toHaveBeenCalledWith(1);
    expect(mocks.pause.discardPausedTimer).toHaveBeenCalledWith(2);
    expect(mocks.tray.always).toHaveBeenCalledWith(true);
    expect(mocks.tray.tickerStart).toHaveBeenCalled();
  });

  it("resumes the newest paused timer and reports the paused tray state", () => {
    mocks.pause.pausedTimers = [{ id: 1, project: "Old", pausedAt: 10 }, { id: 2, project: "New", pausedAt: 20 }];
    mocks.pause.hasPausedTimers = true;
    render(<TrayPopup />);
    mocks.events.get("kimai://pause-resume-timer")?.();
    expect(mocks.pause.resumeTimer).toHaveBeenCalledWith(2);
    expect(mocks.tray.icon).toHaveBeenCalledWith("paused");
    expect(mocks.tray.tooltip).toHaveBeenCalledWith(expect.stringContaining("(+1)"));
  });

  it.each(["focus", "timeline", "taskbar"])("renders and exercises the %s layout", async (layout) => {
    const user = userEvent.setup();
    mocks.kimai.popupLayout = layout;
    render(<TrayPopup />);
    if (layout === "focus") await user.click(screen.getByRole("button", { name: "focus-today" }));
    if (layout === "timeline") await user.click(screen.getByRole("button", { name: "tray.recentTasks" }));
    if (layout === "taskbar") await user.click(screen.getByRole("button", { name: "today.title" }));
    expect(screen.getByTestId("today")).toBeTruthy();
  });

  it("renders loading, unconfigured and category modes", () => {
    mocks.active.status = "loading";
    const { unmount } = render(<TrayPopup />);
    expect(screen.getByText("empty-loading")).toBeTruthy();
    unmount();
    mocks.active.status = "unconfigured";
    const { unmount: unmountUnconfigured } = render(<TrayPopup />);
    expect(screen.getByText("empty-unconfigured")).toBeTruthy();
    unmountUnconfigured();
    mocks.active.status = "connected";
    mocks.kimai.featureFlags.featureCategoryMode = true;
    render(<TrayPopup />);
    expect(screen.getByText("category-panel")).toBeTruthy();
  });

  it("shows and dismisses errors using their priority", async () => {
    const user = userEvent.setup();
    mocks.kimai.switchError = "switch failed";
    const { unmount } = render(<TrayPopup />);
    await user.click(screen.getByRole("button", { name: "error-dismiss" }));
    expect(mocks.kimai.dismissSwitchError).toHaveBeenCalled();
    unmount();
    mocks.kimai.switchError = null;
    mocks.kimai.deleteError = "delete failed";
    render(<TrayPopup />);
    await user.click(screen.getByRole("button", { name: "error-dismiss" }));
    expect(mocks.kimai.dismissDeleteError).toHaveBeenCalled();
  });

  it("processes new and direct-start deep links and surfaces invalid links", async () => {
    render(<TrayPopup />);
    mocks.deepRequest = { action: "new", projectId: 10, activityId: 20, description: "Deep", tags: ["one"], customFields: { unknown: "skip" } };
    mocks.deepLinkHandler?.("new");
    expect(await screen.findByTestId("new-form")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "cancel-new" }));
    mocks.deepRequest = { action: "start", projectId: 10, activityId: 20, description: "Go", tags: [], customFields: {}, label: null };
    mocks.deepLinkHandler?.("start");
    await waitFor(() => expect(mocks.startTask).toHaveBeenCalledWith(expect.objectContaining({ projectId: 10, activityId: 20, label: "Project #10" }), expect.stringContaining("deep-link:")));
    mocks.deepLinkHandler?.("bad");
    expect(await screen.findByText("invalid deep link")).toBeTruthy();
  });

  it("switches deep-link connections and rejects unknown or unconfigured targets", async () => {
    const { unmount } = render(<TrayPopup />);
    mocks.deepRequest = { action: "new", customFields: {} };
    mocks.resolveConnection = "other";
    mocks.deepLinkHandler?.("switch");
    await waitFor(() => expect(mocks.kimai.switchConnection).toHaveBeenCalledWith("other"));
    unmount();

    mocks.resolveConnection = "missing";
    render(<TrayPopup />);
    mocks.deepLinkHandler?.("missing");
    expect(await screen.findByText(/does not exist/)).toBeTruthy();
    cleanup();

    mocks.resolveConnection = null;
    mocks.kimai.client = null;
    mocks.kimai.isConfigured = false;
    render(<TrayPopup />);
    mocks.deepLinkHandler?.("unconfigured");
    expect(await screen.findByText(/Configure the requested/)).toBeTruthy();
  });

  it("runs idle reminder actions and notification behavior", async () => {
    mocks.active.timer = timer;
    mocks.idle = { idleState: "returned", idleStartedAt: new Date("2026-01-01T09:00:00Z"), idleDurationSeconds: 600, dismissIdle: vi.fn() };
    mocks.kimai.idleSettings = { enableIdleDetection: true, idleThresholdMinutes: 5, idleAction: "ask", showIdleNotification: true };
    render(<TrayPopup />);
    await waitFor(() => expect(mocks.reminder.show).toHaveBeenCalledWith(expect.objectContaining({ kind: "idle", project: "Project" })));
    await waitFor(() => expect(mocks.notification).toHaveBeenCalled());
    mocks.events.get("idle-action")?.({ payload: { action: "continue" } });
    mocks.events.get("idle-action")?.({ payload: { action: "stop-at-start" } });
    await waitFor(() => expect(mocks.timesheet.update).toHaveBeenCalled());
    mocks.events.get("idle-action")?.({ payload: { action: "stop-now" } });
    await waitFor(() => expect(mocks.timesheet.stop).toHaveBeenCalled());
    mocks.events.get("idle-action")?.({ payload: { action: "stop-and-new" } });
    await waitFor(() => expect(screen.getByTestId("new-form")).toBeTruthy());
    expect(mocks.idle.dismissIdle).toHaveBeenCalled();
  });

  it("auto-handles stop, discard and continue idle policies", async () => {
    mocks.active.timer = timer;
    mocks.idle = { idleState: "returned", idleStartedAt: new Date(), idleDurationSeconds: 10, dismissIdle: vi.fn() };
    mocks.kimai.idleSettings.idleAction = "stop";
    const { unmount } = render(<TrayPopup />);
    await waitFor(() => expect(mocks.timesheet.stop).toHaveBeenCalled());
    unmount();
    mocks.timesheet.stop.mockClear();
    mocks.kimai.idleSettings.idleAction = "discard";
    const { unmount: unmountDiscard } = render(<TrayPopup />);
    await waitFor(() => expect(mocks.timesheet.update).toHaveBeenCalled());
    unmountDiscard();
    mocks.kimai.idleSettings.idleAction = "continue";
    render(<TrayPopup />);
    await waitFor(() => expect(mocks.idle.dismissIdle).toHaveBeenCalled());
  });

  it("opens the changelog and retains it when the window cannot open", async () => {
    mocks.changelog.claim.mockReturnValue({ version: "1.0.0" });
    mocks.changelog.show.mockResolvedValue(false);
    render(<TrayPopup />);
    await waitFor(() => expect(mocks.changelog.remember).toHaveBeenCalled());
  });
});
