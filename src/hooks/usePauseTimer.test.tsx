// @vitest-environment jsdom

import type { PropsWithChildren } from "react";
import { act, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { KimaiClient } from "../api/kimaiClient";
import type { PausedTimerData } from "../api/pauseStore";
import type { ActiveTimer } from "../types";
import { getEnabledPluginCustomInputs } from "../plugins/customInputs";

const pauseStoreMocks = vi.hoisted(() => ({
  loadPausedTimers: vi.fn(),
  addPausedTimer: vi.fn(),
  removePausedTimer: vi.fn(),
  removeResumedTimer: vi.fn(),
}));
const timesheetMocks = vi.hoisted(() => ({
  startTimesheet: vi.fn(),
  stopTimesheet: vi.fn(),
  updateTimesheetMeta: vi.fn(),
}));

vi.mock("../api/pauseStore", () => pauseStoreMocks);
vi.mock("../api/timesheetApi", () => timesheetMocks);

import { usePauseTimer } from "./usePauseTimer";

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

function client(connectionId: string, revision = 1): KimaiClient {
  return {
    baseUrl: `https://${connectionId}.example.test`,
    connectionId,
    cacheScope: `${connectionId}:${revision}`,
  } as KimaiClient;
}

function paused(connectionId: string): PausedTimerData {
  return {
    id: `paused-${connectionId}`,
    connectionId,
    lastTimesheetId: 1,
    projectId: 2,
    activityId: 3,
    project: "Project",
    projectColor: "",
    activityColor: "",
    customerColor: "",
    activity: "Activity",
    description: "",
    tags: [],
    metadata: { issue_link: "CREATIVE-123" },
    pausedAt: "2026-01-01T00:00:00.000Z",
  };
}

function activeTimer(): ActiveTimer {
  return {
    id: 42,
    projectId: 2,
    activityId: 3,
    project: "Project",
    projectColor: "",
    activityColor: "",
    customerColor: "",
    activity: "Activity",
    description: "",
    tags: [],
    metadata: { issue_link: "CREATIVE-123" },
    beginSeconds: 1_700_000_000,
    beginIso: "2026-01-01T00:00:00.000Z",
  };
}

function wrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return function Wrapper({ children }: PropsWithChildren) {
    return (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
  };
}

function wrapperWithClient(queryClient: QueryClient) {
  return function Wrapper({ children }: PropsWithChildren) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  };
}

describe("paused timer session isolation", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    pauseStoreMocks.addPausedTimer.mockResolvedValue([]);
    pauseStoreMocks.removePausedTimer.mockResolvedValue([]);
    pauseStoreMocks.removeResumedTimer.mockResolvedValue([]);
    timesheetMocks.startTimesheet.mockResolvedValue({ id: 99 });
    timesheetMocks.stopTimesheet.mockResolvedValue(undefined);
    timesheetMocks.updateTimesheetMeta.mockResolvedValue({ id: 99 });
  });

  afterEach(() => vi.useRealTimers());

  it("ignores a previous connection load that completes late", async () => {
    const loadA = deferred<PausedTimerData[]>();
    const loadB = deferred<PausedTimerData[]>();
    pauseStoreMocks.loadPausedTimers
      .mockReturnValueOnce(loadA.promise)
      .mockReturnValueOnce(loadB.promise);

    const { result, rerender } = renderHook(
      ({ connectionId }) =>
        usePauseTimer(client(connectionId), null, connectionId),
      {
        initialProps: { connectionId: "connection-a" },
        wrapper: wrapper(),
      },
    );

    rerender({ connectionId: "connection-b" });
    await act(async () => loadB.resolve([paused("connection-b")]));
    await waitFor(() =>
      expect(result.current.pausedTimers[0]?.connectionId).toBe("connection-b"),
    );

    await act(async () => loadA.resolve([paused("connection-a")]));
    expect(result.current.pausedTimers[0]?.connectionId).toBe("connection-b");
  });

  it("ignores a stale discard result after switching connections", async () => {
    pauseStoreMocks.loadPausedTimers.mockResolvedValueOnce([
      paused("connection-a"),
    ]);
    const discardA = deferred<PausedTimerData[]>();
    pauseStoreMocks.removePausedTimer.mockReturnValueOnce(discardA.promise);

    const { result, rerender } = renderHook(
      ({ connectionId }) =>
        usePauseTimer(client(connectionId), null, connectionId),
      {
        initialProps: { connectionId: "connection-a" },
        wrapper: wrapper(),
      },
    );
    await waitFor(() => expect(result.current.pausedTimers).toHaveLength(1));

    act(() => result.current.discardPausedTimer("paused-connection-a"));
    pauseStoreMocks.loadPausedTimers.mockResolvedValueOnce([
      paused("connection-b"),
    ]);
    rerender({ connectionId: "connection-b" });
    await waitFor(() =>
      expect(result.current.pausedTimers[0]?.connectionId).toBe("connection-b"),
    );

    act(() => result.current.discardPausedTimer("paused-connection-b"));
    await waitFor(() => expect(result.current.pausedTimers).toHaveLength(0));

    await act(async () => discardA.resolve([]));
    expect(result.current.pausedTimers).toHaveLength(0);
  });

  it("treats server resume as successful when cleanup is reconciled", async () => {
    pauseStoreMocks.loadPausedTimers.mockResolvedValueOnce([
      paused("connection-a"),
    ]);
    const { result } = renderHook(
      () =>
        usePauseTimer(
          client("connection-a"),
          null,
          "connection-a",
          getEnabledPluginCustomInputs({ creativeIssueLink: true }),
        ),
      { wrapper: wrapper() },
    );
    await waitFor(() => expect(result.current.pausedTimers).toHaveLength(1));

    act(() => result.current.resumeTimer("paused-connection-a"));

    await waitFor(() => expect(result.current.pausedTimers).toHaveLength(0));
    expect(timesheetMocks.startTimesheet).toHaveBeenCalledTimes(1);
    expect(pauseStoreMocks.removeResumedTimer).toHaveBeenCalledWith(
      "paused-connection-a",
    );
    expect(result.current.pauseError).toBeNull();
  });

  it("copies issue_link metadata to the new timer when resuming", async () => {
    pauseStoreMocks.loadPausedTimers.mockResolvedValueOnce([
      paused("connection-a"),
    ]);
    const { result } = renderHook(
      () =>
        usePauseTimer(
          client("connection-a"),
          null,
          "connection-a",
          getEnabledPluginCustomInputs({ creativeIssueLink: true }),
        ),
      { wrapper: wrapper() },
    );
    await waitFor(() => expect(result.current.pausedTimers).toHaveLength(1));

    act(() => result.current.resumeTimer("paused-connection-a"));

    await waitFor(() =>
      expect(timesheetMocks.updateTimesheetMeta).toHaveBeenCalledWith(
        expect.anything(),
        99,
        { name: "issue_link", value: "CREATIVE-123" },
      ),
    );
  });

  it("deduplicates immediate repeated active timer stops", async () => {
    pauseStoreMocks.loadPausedTimers.mockResolvedValueOnce([]);
    const stopping = deferred<void>();
    timesheetMocks.stopTimesheet.mockReturnValueOnce(stopping.promise);
    const { result } = renderHook(
      () =>
        usePauseTimer(client("connection-a"), activeTimer(), "connection-a"),
      { wrapper: wrapper() },
    );

    act(() => {
      result.current.stopActiveTimer();
      result.current.stopActiveTimer();
    });

    await waitFor(() =>
      expect(timesheetMocks.stopTimesheet).toHaveBeenCalledTimes(1),
    );
    await act(async () => stopping.resolve());
    await waitFor(() => expect(result.current.isStoppingActive).toBe(false));
  });

  it("pauses an active timer, persists recovery data and filters other connections", async () => {
    pauseStoreMocks.loadPausedTimers
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([paused("connection-a"), paused("connection-b")]);
    const { result } = renderHook(
      () => usePauseTimer(client("connection-a"), activeTimer(), "connection-a"),
      { wrapper: wrapper() },
    );
    await waitFor(() => expect(pauseStoreMocks.loadPausedTimers).toHaveBeenCalled());

    act(() => result.current.pauseTimer());

    await waitFor(() => expect(result.current.pausedTimers).toHaveLength(1));
    expect(pauseStoreMocks.addPausedTimer).toHaveBeenCalledWith(
      expect.objectContaining({
        connectionId: "connection-a",
        lastTimesheetId: 42,
        projectId: 2,
        metadata: undefined,
      }),
    );
    expect(timesheetMocks.stopTimesheet).toHaveBeenCalledWith(
      expect.anything(),
      42,
    );
    expect(result.current.pauseError).toBeNull();
  });

  it("keeps the active timer untouched when recovery persistence fails", async () => {
    pauseStoreMocks.loadPausedTimers.mockResolvedValue([]);
    pauseStoreMocks.addPausedTimer.mockRejectedValue(new Error("store failed"));
    const { result } = renderHook(
      () => usePauseTimer(client("connection-a"), activeTimer(), "connection-a"),
      { wrapper: wrapper() },
    );
    await waitFor(() => expect(pauseStoreMocks.loadPausedTimers).toHaveBeenCalled());
    act(() => result.current.pauseTimer());
    await waitFor(() => expect(result.current.pauseError).toBe("store failed"));
    expect(timesheetMocks.stopTimesheet).not.toHaveBeenCalled();
  });

  it("rolls back persisted pause data when stopping Kimai fails", async () => {
    pauseStoreMocks.loadPausedTimers.mockResolvedValue([]);
    timesheetMocks.stopTimesheet.mockRejectedValue(new Error("stop failed"));
    pauseStoreMocks.removePausedTimer.mockRejectedValue(new Error("cleanup failed"));
    const { result } = renderHook(
      () => usePauseTimer(client("connection-a"), activeTimer(), "connection-a"),
      { wrapper: wrapper() },
    );
    await waitFor(() => expect(pauseStoreMocks.loadPausedTimers).toHaveBeenCalled());
    act(() => result.current.pauseTimer());
    await waitFor(() => expect(result.current.pauseError).toBe("stop failed"));
    expect(pauseStoreMocks.removePausedTimer).toHaveBeenCalled();
  });

  it("swaps a running timer and resumes a paused timer with tags and description", async () => {
    const target = {
      ...paused("connection-a"),
      description: "Continue me",
      tags: ["one", "two"],
    };
    pauseStoreMocks.loadPausedTimers.mockResolvedValue([target]);
    const { result } = renderHook(
      () => usePauseTimer(client("connection-a"), activeTimer(), "connection-a"),
      { wrapper: wrapper() },
    );
    await waitFor(() => expect(result.current.pausedTimers).toHaveLength(1));
    act(() => result.current.resumeTimer(target.id));
    await waitFor(() => expect(result.current.resumingId).toBeNull());
    expect(pauseStoreMocks.addPausedTimer).toHaveBeenCalledWith(
      expect.objectContaining({ lastTimesheetId: 42 }),
    );
    expect(timesheetMocks.startTimesheet).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ description: "Continue me", tags: "one,two" }),
    );
  });

  it("rolls back a swap and reports the original stop failure", async () => {
    pauseStoreMocks.loadPausedTimers.mockResolvedValue([paused("connection-a")]);
    timesheetMocks.stopTimesheet.mockRejectedValue(new Error("swap failed"));
    pauseStoreMocks.removePausedTimer.mockRejectedValue(new Error("rollback failed"));
    const { result } = renderHook(
      () => usePauseTimer(client("connection-a"), activeTimer(), "connection-a"),
      { wrapper: wrapper() },
    );
    await waitFor(() => expect(result.current.pausedTimers).toHaveLength(1));
    act(() => result.current.resumeTimer("paused-connection-a"));
    await waitFor(() => expect(result.current.pauseError).toBe("swap failed"));
    expect(timesheetMocks.startTimesheet).not.toHaveBeenCalled();
  });

  it("reports resume and plugin metadata failures and dismisses the error", async () => {
    pauseStoreMocks.loadPausedTimers.mockResolvedValue([paused("connection-a")]);
    timesheetMocks.startTimesheet.mockRejectedValueOnce(new Error("start failed"));
    const { result } = renderHook(
      () =>
        usePauseTimer(
          client("connection-a"),
          null,
          "connection-a",
          getEnabledPluginCustomInputs({ creativeIssueLink: true }),
        ),
      { wrapper: wrapper() },
    );
    await waitFor(() => expect(result.current.pausedTimers).toHaveLength(1));
    act(() => result.current.resumeTimer("paused-connection-a"));
    await waitFor(() => expect(result.current.pauseError).toBe("start failed"));

    timesheetMocks.startTimesheet.mockResolvedValue({ id: 99 });
    timesheetMocks.updateTimesheetMeta.mockRejectedValue("metadata failed");
    act(() => result.current.resumeTimer("paused-connection-a"));
    await waitFor(() =>
      expect(result.current.pauseError).toContain("metadata failed"),
    );
    act(() => result.current.dismissPauseError());
    expect(result.current.pauseError).toBeNull();
  });

  it("discards paused timers and reports a discard failure", async () => {
    pauseStoreMocks.loadPausedTimers.mockResolvedValue([paused("connection-a")]);
    pauseStoreMocks.removePausedTimer
      .mockResolvedValueOnce([])
      .mockRejectedValueOnce(new Error("discard failed"));
    const { result } = renderHook(
      () => usePauseTimer(client("connection-a"), null, "connection-a"),
      { wrapper: wrapper() },
    );
    await waitFor(() => expect(result.current.pausedTimers).toHaveLength(1));
    act(() => result.current.discardPausedTimer("paused-connection-a"));
    await waitFor(() => expect(result.current.pausedTimers).toHaveLength(0));
    act(() => result.current.discardPausedTimer("missing"));
    await waitFor(() => expect(result.current.pauseError).toBe("discard failed"));
    expect(result.current.discardingId).toBeNull();
  });

  it("guards actions without a client, timer or matching paused item", async () => {
    pauseStoreMocks.loadPausedTimers.mockResolvedValue([]);
    const { result } = renderHook(
      () => usePauseTimer(null, null, "connection-a"),
      { wrapper: wrapper() },
    );
    await waitFor(() => expect(pauseStoreMocks.loadPausedTimers).toHaveBeenCalled());
    act(() => {
      result.current.pauseTimer();
      result.current.resumeTimer("missing");
      result.current.stopActiveTimer();
    });
    expect(timesheetMocks.stopTimesheet).not.toHaveBeenCalled();
    expect(timesheetMocks.startTimesheet).not.toHaveBeenCalled();

    const withClient = renderHook(
      () => usePauseTimer(client("connection-b"), null, "connection-b"),
      { wrapper: wrapper() },
    );
    await waitFor(() => expect(pauseStoreMocks.loadPausedTimers).toHaveBeenCalledTimes(2));
    act(() => withClient.result.current.resumeTimer("missing"));
    expect(timesheetMocks.startTimesheet).not.toHaveBeenCalled();
    withClient.unmount();
  });

  it("reports active-stop failures and clears the error on a later success", async () => {
    pauseStoreMocks.loadPausedTimers.mockResolvedValue([]);
    timesheetMocks.stopTimesheet
      .mockRejectedValueOnce(new Error("active stop failed"))
      .mockResolvedValueOnce(undefined);
    const { result } = renderHook(
      () => usePauseTimer(client("connection-a"), activeTimer(), "connection-a"),
      { wrapper: wrapper() },
    );
    await waitFor(() => expect(pauseStoreMocks.loadPausedTimers).toHaveBeenCalled());
    act(() => result.current.stopActiveTimer());
    await waitFor(() => expect(result.current.pauseError).toBe("active stop failed"));
    act(() => result.current.stopActiveTimer());
    await waitFor(() => expect(result.current.pauseError).toBeNull());
    await waitFor(() => expect(result.current.isStoppingActive).toBe(false));
  });

  it("removes the stopped timer from active query data after the exit animation", async () => {
    vi.useFakeTimers();
    pauseStoreMocks.loadPausedTimers.mockResolvedValue([]);
    const qc = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
    qc.setQueryData(["active-timesheets", "scope"], [{ id: 42 }, { id: 43 }]);
    const { result } = renderHook(
      () => usePauseTimer(client("connection-a"), activeTimer(), "connection-a"),
      { wrapper: wrapperWithClient(qc) },
    );
    await act(async () => Promise.resolve());
    act(() => result.current.stopActiveTimer());
    await act(async () => Promise.resolve());
    await act(async () => vi.advanceTimersByTimeAsync(240));
    expect(qc.getQueryData<Array<{ id: number }>>(["active-timesheets", "scope"])).toEqual([{ id: 43 }]);
  });

  it("clears a pending stop animation when the hook unmounts", async () => {
    vi.useFakeTimers();
    pauseStoreMocks.loadPausedTimers.mockResolvedValue([]);
    const { result, unmount } = renderHook(
      () => usePauseTimer(client("connection-a"), activeTimer(), "connection-a"),
      { wrapper: wrapper() },
    );
    await act(async () => Promise.resolve());
    act(() => result.current.stopActiveTimer());
    await act(async () => Promise.resolve());
    expect(result.current.isStoppingActive).toBe(true);
    unmount();
    await act(async () => vi.advanceTimersByTimeAsync(500));
  });

  it.each(["success", "error"])("ignores stale pause %s after a connection switch", async (outcome) => {
    pauseStoreMocks.loadPausedTimers.mockResolvedValue([]);
    let settle!: () => void;
    timesheetMocks.stopTimesheet.mockReturnValueOnce(new Promise<void>((resolve, reject) => {
      settle = () => outcome === "success" ? resolve() : reject(new Error("stale pause"));
    }));
    const { result, rerender } = renderHook(
      ({ id }) => usePauseTimer(client(id), activeTimer(), id),
      { initialProps: { id: "connection-a" }, wrapper: wrapper() },
    );
    await waitFor(() => expect(pauseStoreMocks.loadPausedTimers).toHaveBeenCalled());
    act(() => result.current.pauseTimer());
    await waitFor(() => expect(timesheetMocks.stopTimesheet).toHaveBeenCalled());
    rerender({ id: "connection-b" });
    await act(async () => settle());
    expect(result.current.pauseError).toBeNull();
  });

  it("ignores stale resume and discard errors after switching connections", async () => {
    pauseStoreMocks.loadPausedTimers.mockResolvedValue([paused("connection-a")]);
    let rejectStart!: (error: Error) => void;
    timesheetMocks.startTimesheet.mockImplementationOnce(() => new Promise((_resolve, reject) => { rejectStart = reject; }));
    const { result, rerender } = renderHook(
      ({ id }) => usePauseTimer(client(id), null, id),
      { initialProps: { id: "connection-a" }, wrapper: wrapper() },
    );
    await waitFor(() => expect(result.current.pausedTimers).toHaveLength(1));
    act(() => result.current.resumeTimer("paused-connection-a"));
    await waitFor(() => expect(timesheetMocks.startTimesheet).toHaveBeenCalled());
    rerender({ id: "connection-b" });
    await act(async () => rejectStart(new Error("stale resume")));
    expect(result.current.pauseError).toBeNull();

    let rejectDiscard!: (error: Error) => void;
    pauseStoreMocks.removePausedTimer.mockImplementationOnce(() => new Promise((_resolve, reject) => { rejectDiscard = reject; }));
    act(() => result.current.discardPausedTimer("any"));
    await waitFor(() => expect(pauseStoreMocks.removePausedTimer).toHaveBeenCalled());
    rerender({ id: "connection-c" });
    await act(async () => rejectDiscard(new Error("stale discard")));
    expect(result.current.pauseError).toBeNull();
  });

  it("ignores a stale resume success after switching connections", async () => {
    pauseStoreMocks.loadPausedTimers.mockResolvedValue([paused("connection-a")]);
    const cleanupResult = deferred<PausedTimerData[]>();
    pauseStoreMocks.removeResumedTimer.mockReturnValueOnce(cleanupResult.promise);
    const { result, rerender } = renderHook(
      ({ id }) => usePauseTimer(client(id), null, id),
      { initialProps: { id: "connection-a" }, wrapper: wrapper() },
    );
    await waitFor(() => expect(result.current.pausedTimers).toHaveLength(1));
    act(() => result.current.resumeTimer("paused-connection-a"));
    await waitFor(() => expect(pauseStoreMocks.removeResumedTimer).toHaveBeenCalled());

    rerender({ id: "connection-b" });
    await act(async () => cleanupResult.resolve([]));

    expect(result.current.pauseError).toBeNull();
  });

  it("ignores a stale active-stop success after switching sessions", async () => {
    pauseStoreMocks.loadPausedTimers.mockResolvedValue([]);
    const pending = deferred<void>();
    timesheetMocks.stopTimesheet.mockReturnValueOnce(pending.promise);
    const { result, rerender } = renderHook(
      ({ id }) => usePauseTimer(client(id), activeTimer(), id),
      { initialProps: { id: "connection-a" }, wrapper: wrapper() },
    );
    await waitFor(() => expect(pauseStoreMocks.loadPausedTimers).toHaveBeenCalled());
    act(() => result.current.stopActiveTimer());
    await waitFor(() => expect(timesheetMocks.stopTimesheet).toHaveBeenCalled());
    rerender({ id: "connection-b" });
    await act(async () => pending.resolve());
    expect(result.current.pauseError).toBeNull();
  });

  it("ignores a stale active-stop error after switching sessions", async () => {
    pauseStoreMocks.loadPausedTimers.mockResolvedValue([]);
    let rejectStop!: (error: Error) => void;
    timesheetMocks.stopTimesheet.mockImplementationOnce(() => new Promise((_resolve, reject) => { rejectStop = reject; }));
    const { result, rerender } = renderHook(
      ({ id }) => usePauseTimer(client(id), activeTimer(), id),
      { initialProps: { id: "connection-a" }, wrapper: wrapper() },
    );
    await waitFor(() => expect(pauseStoreMocks.loadPausedTimers).toHaveBeenCalled());
    act(() => result.current.stopActiveTimer());
    await waitFor(() => expect(timesheetMocks.stopTimesheet).toHaveBeenCalled());
    rerender({ id: "connection-b" });
    await act(async () => rejectStop(new Error("stale stop")));
    expect(result.current.pauseError).toBeNull();
  });

  it("filters resume and discard results to the operation connection", async () => {
    const own = paused("connection-a");
    pauseStoreMocks.loadPausedTimers.mockResolvedValue([own]);
    pauseStoreMocks.removeResumedTimer.mockResolvedValue([paused("connection-a"), paused("connection-b")]);
    pauseStoreMocks.removePausedTimer.mockResolvedValue([paused("connection-a"), paused("connection-b")]);
    const { result } = renderHook(
      () => usePauseTimer(client("connection-a"), null, "connection-a"),
      { wrapper: wrapper() },
    );
    await waitFor(() => expect(result.current.pausedTimers).toHaveLength(1));
    act(() => result.current.resumeTimer(own.id));
    await waitFor(() => expect(pauseStoreMocks.removeResumedTimer).toHaveBeenCalled());
    expect(result.current.pausedTimers.every((item) => item.connectionId === "connection-a")).toBe(true);
    act(() => result.current.discardPausedTimer("anything"));
    await waitFor(() => expect(pauseStoreMocks.removePausedTimer).toHaveBeenCalled());
    expect(result.current.pausedTimers.every((item) => item.connectionId === "connection-a")).toBe(true);
  });

  it("guards repeated discards and stopping with a timer but no client", async () => {
    pauseStoreMocks.loadPausedTimers.mockResolvedValue([paused("connection-a")]);
    const pending = deferred<PausedTimerData[]>();
    pauseStoreMocks.removePausedTimer.mockReturnValueOnce(pending.promise);
    const { result, rerender } = renderHook(
      ({ hasClient }) => usePauseTimer(hasClient ? client("connection-a") : null, activeTimer(), "connection-a"),
      { initialProps: { hasClient: true }, wrapper: wrapper() },
    );
    await waitFor(() => expect(result.current.pausedTimers).toHaveLength(1));
    act(() => result.current.discardPausedTimer("paused-connection-a"));
    await waitFor(() => expect(pauseStoreMocks.removePausedTimer).toHaveBeenCalledTimes(1));
    act(() => result.current.discardPausedTimer("paused-connection-a"));
    expect(pauseStoreMocks.removePausedTimer).toHaveBeenCalledTimes(1);
    await act(async () => pending.resolve([]));
    rerender({ hasClient: false });
    act(() => result.current.stopActiveTimer());
    expect(timesheetMocks.stopTimesheet).not.toHaveBeenCalled();
  });
});
