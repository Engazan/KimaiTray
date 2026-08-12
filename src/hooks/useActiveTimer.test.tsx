// @vitest-environment jsdom

import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { KimaiClient } from "../api/kimaiClient";
import { KimaiApiError } from "../api/kimaiClient";
import type { KimaiTimesheetEntry } from "../api/kimaiTypes";

interface MutationOptions {
  mutationFn: (id: number) => Promise<unknown>;
  onSuccess: () => void;
}

const mocks = vi.hoisted(() => ({
  useQuery: vi.fn(),
  useMutation: vi.fn(),
  useQueryClient: vi.fn(),
  getActiveTimesheets: vi.fn(),
  stopTimesheet: vi.fn(),
  useEntityLookup: vi.fn(),
  invalidateTimesheets: vi.fn(),
  mutate: vi.fn(),
  queryClient: { id: "query-client" },
  mutationOptions: undefined as MutationOptions | undefined,
}));

vi.mock("@tanstack/react-query", () => ({
  useQuery: mocks.useQuery,
  useMutation: mocks.useMutation,
  useQueryClient: mocks.useQueryClient,
}));
vi.mock("../api/timesheetApi", () => ({
  getActiveTimesheets: mocks.getActiveTimesheets,
  stopTimesheet: mocks.stopTimesheet,
}));
vi.mock("./useEntityLookup", () => ({ useEntityLookup: mocks.useEntityLookup }));
vi.mock("./invalidateTimesheets", () => ({
  invalidateTimesheets: mocks.invalidateTimesheets,
}));
vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => `translated:${key}` }),
}));

import { useActiveTimer } from "./useActiveTimer";

const client = { cacheScope: "connection-a:1" } as KimaiClient;

function entry(id: number, begin: string): KimaiTimesheetEntry {
  return {
    id,
    begin,
    end: null,
    duration: null,
    description: `Timer ${id}`,
    rate: 0,
    internalRate: 0,
    exported: false,
    billable: true,
    tags: ["support", "SUPPORT"],
    project: 1,
    activity: 2,
    user: 1,
    metaFields: [{ name: "issue_link", value: `KT-${id}` }],
  };
}

describe("active timer state", () => {
  let queryState: { data: KimaiTimesheetEntry[]; isLoading: boolean; error: unknown };
  let mutationState: { mutate: typeof mocks.mutate; isPending: boolean; error: unknown };

  beforeEach(() => {
    vi.resetAllMocks();
    queryState = { data: [], isLoading: false, error: null };
    mutationState = { mutate: mocks.mutate, isPending: false, error: null };
    mocks.useQuery.mockImplementation(() => queryState);
    mocks.useQueryClient.mockReturnValue(mocks.queryClient);
    mocks.useMutation.mockImplementation((options) => {
      mocks.mutationOptions = options;
      return mutationState;
    });
    mocks.useEntityLookup.mockReturnValue({
      projects: [{ id: 1, name: "Project", customer: 3, color: "#111111" }],
      activities: [{ id: 2, name: "Activity", project: 1, color: "#222222" }],
      customers: [{ id: 3, name: "Customer", color: "#333333" }],
    });
  });

  it("maps the newest active entry and exposes multiple-active state", () => {
    queryState.data = [
      entry(1, "2026-08-12T08:00:00Z"),
      entry(2, "2026-08-12T09:00:00Z"),
    ];
    const { result } = renderHook(() => useActiveTimer(client, true, 15));

    expect(result.current.multipleActive).toBe(true);
    expect(result.current.timer).toMatchObject({
      id: 2,
      projectId: 1,
      activityId: 2,
      project: "Project",
      activity: "Activity",
      projectColor: "#111111",
      activityColor: "#222222",
      customerColor: "#333333",
      tags: ["support"],
      metadata: { issue_link: "KT-2" },
      beginSeconds: Math.floor(Date.parse("2026-08-12T09:00:00Z") / 1000),
    });
    expect(result.current.status).toBe("connected");
  });

  it("uses readable fallbacks when list entities are unavailable", () => {
    queryState.data = [entry(1, "2026-08-12T08:00:00Z")];
    mocks.useEntityLookup.mockReturnValue({ projects: [], activities: [], customers: [] });
    const { result } = renderHook(() => useActiveTimer(client, true, 15));

    expect(result.current.timer).toMatchObject({
      project: "Project #1",
      activity: "Activity #2",
      projectColor: "",
      activityColor: "",
      customerColor: "",
    });
  });

  it("configures active polling and stopping through the API", async () => {
    queryState.data = [entry(42, "2026-08-12T08:00:00Z")];
    const { result } = renderHook(() => useActiveTimer(client, true, 15));
    const queryOptions = mocks.useQuery.mock.calls[0][0];
    mocks.getActiveTimesheets.mockResolvedValue(queryState.data);
    mocks.stopTimesheet.mockResolvedValue(queryState.data[0]);

    expect(queryOptions).toMatchObject({
      queryKey: ["active-timesheets", "connection-a:1"],
      enabled: true,
      refetchInterval: 15_000,
    });
    await expect(queryOptions.queryFn()).resolves.toEqual(queryState.data);
    await expect(mocks.mutationOptions?.mutationFn(42)).resolves.toEqual(
      queryState.data[0],
    );
    act(() => result.current.stopTimer());
    expect(mocks.mutate).toHaveBeenCalledWith(42);
    mocks.mutationOptions?.onSuccess();
    expect(mocks.invalidateTimesheets).toHaveBeenCalledWith(mocks.queryClient);
  });

  it("does not stop when there is no active timer", () => {
    const { result } = renderHook(() => useActiveTimer(client, true, 15));
    act(() => result.current.stopTimer());
    expect(mocks.mutate).not.toHaveBeenCalled();
  });

  it.each([
    [{ settingsReady: false, isConfigured: true, loading: false, error: null }, "loading", ""],
    [{ settingsReady: true, isConfigured: false, loading: false, error: null }, "unconfigured", ""],
    [{ settingsReady: true, isConfigured: true, loading: true, error: null }, "loading", ""],
    [{ settingsReady: true, isConfigured: true, loading: false, error: new Error("bad data") }, "error", "Error: bad data"],
  ])("derives connection status %#", (scenario, status, errorMessage) => {
    queryState.isLoading = scenario.loading;
    queryState.error = scenario.error;
    const { result } = renderHook(() =>
      useActiveTimer(client, scenario.isConfigured, 15, scenario.settingsReady),
    );

    expect(result.current.status).toBe(status);
    expect(result.current.errorMessage).toBe(errorMessage);
  });

  it("distinguishes offline API errors from server errors", () => {
    queryState.error = new KimaiApiError(
      0,
      "Network Error",
      null,
      "network_error",
    );
    const { result, rerender } = renderHook(() =>
      useActiveTimer(client, true, 15),
    );
    expect(result.current.status).toBe("offline");
    expect(result.current.errorMessage).toBe("Could not reach the Kimai server");

    queryState.error = new KimaiApiError(500, "Server Error", null, "server_error");
    rerender();
    expect(result.current.status).toBe("error");
    expect(result.current.errorMessage).toBe("Kimai server error");
  });

  it("surfaces mutation errors and pending state", () => {
    mutationState.isPending = true;
    mutationState.error = new Error("stop failed");
    const { result, rerender } = renderHook(() => useActiveTimer(client, true, 15));

    expect(result.current.isStopping).toBe(true);
    expect(result.current.errorMessage).toBe("translated:errors.failedToStopTimer");

    mutationState.error = new KimaiApiError(403, "Forbidden", null, "forbidden");
    rerender();
    expect(result.current.errorMessage).toBe(
      "You do not have permission for this action",
    );
  });
});
