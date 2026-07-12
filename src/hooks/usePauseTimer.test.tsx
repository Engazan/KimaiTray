// @vitest-environment jsdom

import type { PropsWithChildren } from "react";
import { act, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { KimaiClient } from "../api/kimaiClient";
import type { PausedTimerData } from "../api/pauseStore";

const pauseStoreMocks = vi.hoisted(() => ({
  loadPausedTimers: vi.fn(),
  addPausedTimer: vi.fn(),
  removePausedTimer: vi.fn(),
  removeResumedTimer: vi.fn(),
}));
const timesheetMocks = vi.hoisted(() => ({
  startTimesheet: vi.fn(),
  stopTimesheet: vi.fn(),
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
    pausedAt: "2026-01-01T00:00:00.000Z",
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

describe("paused timer session isolation", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    pauseStoreMocks.addPausedTimer.mockResolvedValue([]);
    pauseStoreMocks.removePausedTimer.mockResolvedValue([]);
    pauseStoreMocks.removeResumedTimer.mockResolvedValue([]);
    timesheetMocks.startTimesheet.mockResolvedValue({ id: 99 });
    timesheetMocks.stopTimesheet.mockResolvedValue(undefined);
  });

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
      () => usePauseTimer(client("connection-a"), null, "connection-a"),
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
});
