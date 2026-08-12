// @vitest-environment jsdom

import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { KimaiClient } from "../api/kimaiClient";
import type { KimaiTimesheetEntry } from "../api/kimaiTypes";

const mocks = vi.hoisted(() => ({
  useQuery: vi.fn(),
  getTimesheets: vi.fn(),
  useEntityLookup: vi.fn(),
  refetch: vi.fn(),
}));

vi.mock("@tanstack/react-query", () => ({ useQuery: mocks.useQuery }));
vi.mock("../api/timesheetApi", () => ({ getTimesheets: mocks.getTimesheets }));
vi.mock("./useEntityLookup", () => ({ useEntityLookup: mocks.useEntityLookup }));

import { useTodayTimesheets } from "./useTodayTimesheets";

const client = { cacheScope: "connection-a:1" } as KimaiClient;

function entry(id: number, hour: number, duration = 60): KimaiTimesheetEntry {
  return {
    id,
    begin: `2026-08-12T${String(hour).padStart(2, "0")}:00:00Z`,
    end: `2026-08-12T${String(hour).padStart(2, "0")}:01:00Z`,
    duration,
    description: `Entry ${id}`,
    rate: 0,
    internalRate: 0,
    exported: false,
    billable: id % 2 === 0,
    tags: ["tag"],
    project: 1,
    activity: 2,
    user: 1,
  };
}

describe("today timesheet derivation", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-12T12:00:10Z"));
    vi.resetAllMocks();
    mocks.useQuery.mockReturnValue({
      data: [],
      isLoading: false,
      isError: false,
      refetch: mocks.refetch,
    });
    mocks.useEntityLookup.mockReturnValue({
      projects: [{ id: 1, name: "Project", customer: 3, color: "#111111" }],
      activities: [{ id: 2, name: "Activity", project: 1, color: "#222222" }],
      customers: [{ id: 3, name: "Customer", color: "#333333" }],
    });
  });

  afterEach(() => vi.useRealTimers());

  it("configures the bounded local-day query", async () => {
    renderHook(() => useTodayTimesheets(client, true, 30));
    const options = mocks.useQuery.mock.calls[0][0];
    mocks.getTimesheets.mockResolvedValue([]);

    expect(options).toMatchObject({
      queryKey: ["today-timesheets", "connection-a:1"],
      enabled: true,
      refetchInterval: 30_000,
      staleTime: 15_000,
    });
    await options.queryFn();
    expect(mocks.getTimesheets).toHaveBeenCalledWith(
      client,
      expect.objectContaining({
        begin: "2026-08-12T00:00:00",
        end: "2026-08-12T23:59:59",
        orderBy: "begin",
        order: "DESC",
        size: 50,
      }),
    );
  });

  it("maps entities, totals durations and defaults to five newest entries", () => {
    mocks.useQuery.mockReturnValue({
      data: Array.from({ length: 6 }, (_, index) => entry(index + 1, index + 1, 60)),
      isLoading: false,
      isError: false,
      refetch: mocks.refetch,
    });

    const { result } = renderHook(() => useTodayTimesheets(client, true, 30));

    expect(result.current.entries).toHaveLength(5);
    expect(result.current.entries[0]).toMatchObject({
      id: 6,
      project: "Project",
      activity: "Activity",
      customer: "Customer",
      tags: ["tag"],
      isRunning: false,
    });
    expect(result.current.totalCount).toBe(6);
    expect(result.current.totalDuration).toBe(360);
    expect(result.current.hasMore).toBe(true);
    expect(result.current.refetch).toBe(mocks.refetch);
  });

  it("expands all entries and toggles chronological sorting", () => {
    mocks.useQuery.mockReturnValue({
      data: Array.from({ length: 6 }, (_, index) => entry(index + 1, index + 1)),
      isLoading: false,
      isError: false,
      refetch: mocks.refetch,
    });
    const { result } = renderHook(() => useTodayTimesheets(client, true, 30));

    act(() => result.current.setExpanded(true));
    expect(result.current.entries).toHaveLength(6);
    act(() => result.current.setSortAsc(true));
    expect(result.current.entries[0].id).toBe(1);
    expect(result.current.expanded).toBe(true);
    expect(result.current.sortAsc).toBe(true);
  });

  it("calculates live running duration and uses missing-entity fallbacks", () => {
    const running = { ...entry(7, 12, 0), end: null, duration: null };
    mocks.useQuery.mockReturnValue({
      data: [running],
      isLoading: true,
      isError: true,
      refetch: mocks.refetch,
    });
    mocks.useEntityLookup.mockReturnValue({ projects: [], activities: [], customers: [] });

    const { result, unmount } = renderHook(() =>
      useTodayTimesheets(client, true, 30),
    );

    expect(result.current.entries[0]).toMatchObject({
      project: "Project #1",
      activity: "Activity #2",
      customer: "",
      duration: 10,
      isRunning: true,
    });
    expect(result.current.totalDuration).toBe(10);
    expect(result.current.isLoading).toBe(true);
    expect(result.current.isError).toBe(true);
    unmount();
  });

  it("disables loading when no configured client exists", () => {
    renderHook(() => useTodayTimesheets(null, true, 30));
    expect(mocks.useQuery.mock.calls[0][0].enabled).toBe(false);
  });
});
