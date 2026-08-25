// @vitest-environment jsdom

import { renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { KimaiClient } from "../api/kimaiClient";
import type { KimaiTimesheetEntry } from "../api/kimaiTypes";

const mocks = vi.hoisted(() => ({
  useQuery: vi.fn(),
  getRecentTimesheets: vi.fn(),
  useEntityLookup: vi.fn(),
}));

vi.mock("@tanstack/react-query", () => ({ useQuery: mocks.useQuery }));
vi.mock("../api/timesheetApi", () => ({
  getRecentTimesheets: mocks.getRecentTimesheets,
}));
vi.mock("./useEntityLookup", () => ({
  useEntityLookup: mocks.useEntityLookup,
}));

import { useRecentTasks } from "./useRecentTasks";
import { taskKeyOf } from "../utils/taskKey";

const client = { cacheScope: "connection-a:1" } as KimaiClient;

function entry(
  id: number,
  project: number,
  activity: number,
  begin: string,
  description = `Description ${id}`,
): KimaiTimesheetEntry {
  return {
    id,
    begin,
    end: "2026-08-12T10:00:00Z",
    duration: 3600,
    description,
    rate: 0,
    internalRate: 0,
    exported: false,
    billable: true,
    tags: ["support", "SUPPORT"],
    project,
    activity,
    user: 1,
    metaFields: [{ name: "issue_link", value: `KT-${id}` }],
  };
}

describe("recent task derivation", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-12T12:00:00Z"));
    vi.resetAllMocks();
    mocks.useQuery.mockReturnValue({ data: [], isLoading: false, isError: false });
    mocks.useEntityLookup.mockReturnValue({
      projects: [{ id: 1, name: "KimaiTray", customer: 9, color: "#111111" }],
      activities: [{ id: 2, name: "Development", project: 1, color: "#222222" }],
      customers: [{ id: 9, name: "ACME", color: "#333333" }],
    });
  });

  afterEach(() => vi.useRealTimers());

  it("disables the query unless both client and configuration exist", () => {
    renderHook(() => useRecentTasks(client, false));
    expect(mocks.useQuery.mock.calls[0][0]).toMatchObject({
      queryKey: ["recent-timesheets", "connection-a:1"],
      enabled: false,
      staleTime: 30_000,
    });

    mocks.useQuery.mockClear();
    renderHook(() => useRecentTasks(null, true));
    expect(mocks.useQuery.mock.calls[0][0].enabled).toBe(false);
  });

  it("fetches twenty recent entries for the active connection", async () => {
    renderHook(() => useRecentTasks(client, true));
    const options = mocks.useQuery.mock.calls[0][0];
    mocks.getRecentTimesheets.mockResolvedValue([]);

    await expect(options.queryFn()).resolves.toEqual([]);
    expect(mocks.getRecentTimesheets).toHaveBeenCalledWith(client, 20);
  });

  it("sorts newest first, deduplicates identical task variants and excludes the active variant", () => {
    mocks.useQuery.mockReturnValue({
      data: [
        entry(1, 1, 2, "2026-08-10T09:00:00Z", "Same note"),
        entry(2, 1, 2, "2026-08-12T09:00:00Z", "Same note"),
        entry(3, 5, 6, "2026-08-11T09:00:00Z"),
      ],
      isLoading: false,
      isError: false,
    });

    const { result } = renderHook(() =>
      useRecentTasks(client, true, taskKeyOf(5, 6, "Description 3")),
    );

    expect(result.current.tasks).toHaveLength(1);
    expect(result.current.tasks[0]).toMatchObject({
      key: taskKeyOf(1, 2, "Same note"),
      timesheetId: 2,
      project: "KimaiTray",
      activity: "Development",
      customer: "ACME",
      projectColor: "#111111",
      activityColor: "#222222",
      customerColor: "#333333",
      tags: ["support"],
      metadata: { issue_link: "KT-2" },
      lastUsed: expect.any(String),
    });
  });

  it("keeps separate recent items for the same project and activity when notes differ", () => {
    mocks.useQuery.mockReturnValue({
      data: [
        entry(1, 1, 2, "2026-08-11T09:00:00Z", "First note"),
        entry(2, 1, 2, "2026-08-12T09:00:00Z", "Second note"),
        entry(3, 1, 2, "2026-08-10T09:00:00Z", "First note"),
      ],
      isLoading: false,
      isError: false,
    });

    const { result } = renderHook(() => useRecentTasks(client, true));

    expect(result.current.tasks).toHaveLength(2);
    expect(result.current.tasks.map((task) => task.description)).toEqual([
      "Second note",
      "First note",
    ]);
    expect(new Set(result.current.tasks.map((task) => task.key)).size).toBe(2);
  });

  it("uses entity fallbacks and limits the result to six unique tasks", () => {
    mocks.useQuery.mockReturnValue({
      data: Array.from({ length: 8 }, (_, index) =>
        entry(
          index + 1,
          index + 10,
          index + 20,
          `2026-08-${String(index + 1).padStart(2, "0")}T09:00:00Z`,
        ),
      ),
      isLoading: true,
      isError: true,
    });
    mocks.useEntityLookup.mockReturnValue({ projects: [], activities: [], customers: [] });

    const { result } = renderHook(() => useRecentTasks(client, true));

    expect(result.current.tasks).toHaveLength(6);
    expect(result.current.tasks[0]).toMatchObject({
      key: taskKeyOf(17, 27, "Description 8"),
      project: "Project #17",
      activity: "Activity #27",
      customer: "",
    });
    expect(result.current.isLoading).toBe(true);
    expect(result.current.isError).toBe(true);
  });
});
