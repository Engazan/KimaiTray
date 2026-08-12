// @vitest-environment jsdom

import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { KimaiClient } from "../api/kimaiClient";

interface QueryConfig {
  queryKey: readonly unknown[];
  queryFn: () => Promise<unknown>;
  enabled?: boolean;
  staleTime?: number;
  retry?: number;
}

const mocks = vi.hoisted(() => ({
  useQuery: vi.fn(),
  useQueries: vi.fn(),
  getProjects: vi.fn(),
  getCustomers: vi.fn(),
  getProject: vi.fn(),
  getCustomer: vi.fn(),
  getActivities: vi.fn(),
  getActivity: vi.fn(),
  queryConfigs: [] as QueryConfig[],
}));

vi.mock("@tanstack/react-query", () => ({
  useQuery: mocks.useQuery,
  useQueries: mocks.useQueries,
}));
vi.mock("../api/projectApi", () => ({
  getProjects: mocks.getProjects,
  getCustomers: mocks.getCustomers,
  getProject: mocks.getProject,
  getCustomer: mocks.getCustomer,
}));
vi.mock("../api/activityApi", () => ({
  getActivities: mocks.getActivities,
  getActivity: mocks.getActivity,
}));

import { useEntityLookup } from "./useEntityLookup";

const client = { cacheScope: "connection-a:1" } as KimaiClient;
const project = { id: 1, name: "Project", customer: 3 };
const activity = { id: 2, name: "Activity", project: 1 };
const customer = { id: 3, name: "Customer" };

describe("entity lookup hydration", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.queryConfigs = [];
    mocks.useQuery.mockImplementation((options) => {
      const key = options.queryKey[0];
      if (key === "projects") return { data: [project], isSuccess: true };
      if (key === "activities") return { data: [activity], isSuccess: true };
      return { data: [customer], isSuccess: true };
    });
    mocks.useQueries.mockImplementation(({ queries }) => {
      mocks.queryConfigs.push(...queries);
      return queries.map(() => ({ data: undefined }));
    });
  });

  it("returns complete list data without issuing item fallback queries", () => {
    const { result } = renderHook(() =>
      useEntityLookup(client, true, [1], [2]),
    );

    expect(result.current).toEqual({
      projects: [project],
      activities: [activity],
      customers: [customer],
    });
    expect(mocks.queryConfigs).toEqual([]);
    expect(mocks.useQuery).toHaveBeenCalledTimes(3);
    for (const [options] of mocks.useQuery.mock.calls) {
      expect(options.enabled).toBe(true);
      expect(options.staleTime).toBe(300_000);
    }
  });

  it("hydrates projects, activities and their customers missing from list endpoints", async () => {
    const extraProject = { id: 99, name: "Archived Project", customer: 77 };
    const extraActivity = { id: 88, name: "Archived Activity", project: 99 };
    const extraCustomer = { id: 77, name: "Archived Customer" };
    mocks.useQueries.mockImplementation(({ queries }) => {
      mocks.queryConfigs.push(...queries);
      return queries.map((options: QueryConfig) => {
        const [kind] = options.queryKey;
        if (kind === "project") return { data: extraProject };
        if (kind === "activity") return { data: extraActivity };
        if (kind === "customer") return { data: extraCustomer };
        return { data: undefined };
      });
    });

    const { result } = renderHook(() =>
      useEntityLookup(client, true, [1, 99], [2, 88]),
    );

    expect(result.current.projects).toEqual([project, extraProject]);
    expect(result.current.activities).toEqual([activity, extraActivity]);
    expect(result.current.customers).toEqual([customer, extraCustomer]);
    expect(mocks.queryConfigs.map((config) => config.queryKey)).toEqual([
      ["project", "connection-a:1", 99],
      ["activity", "connection-a:1", 88],
      ["customer", "connection-a:1", 77],
    ]);

    mocks.getProject.mockResolvedValue(extraProject);
    mocks.getActivity.mockResolvedValue(extraActivity);
    mocks.getCustomer.mockResolvedValue(extraCustomer);
    await expect(mocks.queryConfigs[0].queryFn()).resolves.toEqual(extraProject);
    await expect(mocks.queryConfigs[1].queryFn()).resolves.toEqual(extraActivity);
    await expect(mocks.queryConfigs[2].queryFn()).resolves.toEqual(extraCustomer);
  });

  it("waits for successful list queries before detecting missing ids", () => {
    mocks.useQuery.mockImplementation(() => ({ data: [], isSuccess: false }));

    const { result } = renderHook(() =>
      useEntityLookup(client, true, [99], [88]),
    );

    expect(result.current).toEqual({ projects: [], activities: [], customers: [] });
    expect(mocks.queryConfigs).toEqual([]);
  });

  it("configures disabled list queries without a client-enabled state", async () => {
    renderHook(() => useEntityLookup(null, false, [], []));
    for (const [options] of mocks.useQuery.mock.calls) {
      expect(options.enabled).toBe(false);
    }

    mocks.getProjects.mockResolvedValue([]);
    mocks.getActivities.mockResolvedValue([]);
    mocks.getCustomers.mockResolvedValue([]);
    const [projects, activities, customers] = mocks.useQuery.mock.calls.map(
      ([options]) => options,
    );
    await expect(projects.queryFn()).resolves.toEqual([]);
    await expect(activities.queryFn()).resolves.toEqual([]);
    await expect(customers.queryFn()).resolves.toEqual([]);
  });
});
