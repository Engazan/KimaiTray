// @vitest-environment jsdom

import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { KimaiClient } from "../api/kimaiClient";
import type { CategoryConfig } from "./types";

const mocks = vi.hoisted(() => ({
  useQuery: vi.fn(),
  getActivities: vi.fn(),
  loadCategoryConfig: vi.fn(),
  saveCategoryConfig: vi.fn(),
  onCategoryConfigChange: vi.fn(),
  fetchRemoteCategoryConfig: vi.fn(),
  configListener: undefined as ((config: CategoryConfig) => void) | undefined,
  cleanup: vi.fn(),
}));

vi.mock("@tanstack/react-query", () => ({ useQuery: mocks.useQuery }));
vi.mock("../api/activityApi", () => ({ getActivities: mocks.getActivities }));
vi.mock("./categoryConfigStore", () => ({
  loadCategoryConfig: mocks.loadCategoryConfig,
  saveCategoryConfig: mocks.saveCategoryConfig,
  onCategoryConfigChange: mocks.onCategoryConfigChange,
}));
vi.mock("./categoryRemoteSource", () => ({
  fetchRemoteCategoryConfig: mocks.fetchRemoteCategoryConfig,
}));

import { useCategoryActivityMapping } from "./useCategoryActivityMapping";
import { useCategoryConfig } from "./useCategoryConfig";
import { useCategoryRemoteSync } from "./useCategoryRemoteSync";

const client = { cacheScope: "connection-a:1" } as KimaiClient;
const baseConfig: CategoryConfig = {
  categories: [],
  defaultProjectId: 1,
  continueWindowMinutes: 15,
  sourceUrl: "https://config.test/categories.json",
};

describe("category activity mapping", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.useQuery.mockReturnValue({ data: [], isLoading: false, isError: false });
  });

  it("indexes global and project-specific activities without cross-project leakage", () => {
    mocks.useQuery.mockReturnValue({
      data: [
        { id: 1, name: "Support", project: null },
        { id: 2, name: "Support", project: 10 },
        { id: 3, name: "Support", project: 20 },
        { id: 4, name: "Scoped Only", project: 10 },
        { id: 5, name: "Support", project: null },
        { id: 6, name: "Support", project: 10 },
      ],
      isLoading: true,
      isError: true,
    });
    const { result } = renderHook(() => useCategoryActivityMapping(client));

    expect(result.current.has("Support")).toBe(true);
    expect(result.current.has("Missing")).toBe(false);
    expect(result.current.resolve("Support", 10)).toBe(2);
    expect(result.current.resolve("Support", 99)).toBe(1);
    expect(result.current.resolve("Support", null)).toBe(1);
    expect(result.current.resolve("Scoped Only", 20)).toBeNull();
    expect(result.current.resolve("Missing", 10)).toBeNull();
    expect(result.current.isLoading).toBe(true);
    expect(result.current.isError).toBe(true);
  });

  it("configures a shared activity-list query", async () => {
    renderHook(() => useCategoryActivityMapping(null));
    const options = mocks.useQuery.mock.calls[0][0];
    expect(options).toMatchObject({
      queryKey: ["activities", undefined],
      enabled: false,
      staleTime: 300_000,
    });
    mocks.getActivities.mockResolvedValue([]);
    await expect(options.queryFn()).resolves.toEqual([]);
    expect(mocks.getActivities).toHaveBeenCalledWith(null);
  });
});

describe("category config synchronization", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.configListener = undefined;
    mocks.loadCategoryConfig.mockResolvedValue(baseConfig);
    mocks.saveCategoryConfig.mockResolvedValue(undefined);
    mocks.onCategoryConfigChange.mockImplementation((_connectionId, listener) => {
      mocks.configListener = listener;
      return Promise.resolve(mocks.cleanup);
    });
  });

  it("loads the connection and applies external store changes", async () => {
    const { result } = renderHook(() => useCategoryConfig("connection-a"));
    expect(result.current.loaded).toBe(false);
    await waitFor(() => expect(result.current.loaded).toBe(true));
    expect(result.current.config).toEqual(baseConfig);
    expect(mocks.loadCategoryConfig).toHaveBeenCalledWith("connection-a");

    const external = { ...baseConfig, continueWindowMinutes: 30 };
    act(() => mocks.configListener?.(external));
    expect(result.current.config).toEqual(external);
  });

  it("updates optimistically and ignores its own store echo", async () => {
    const { result } = renderHook(() => useCategoryConfig("connection-a"));
    await waitFor(() => expect(result.current.loaded).toBe(true));
    const next = { ...baseConfig, continueWindowMinutes: 45 };

    await act(async () => result.current.updateConfig(next));
    expect(result.current.config).toEqual(next);
    expect(mocks.saveCategoryConfig).toHaveBeenCalledWith("connection-a", next);

    const foreign = { ...baseConfig, continueWindowMinutes: 60 };
    act(() => {
      mocks.configListener?.(next);
      mocks.configListener?.(foreign);
    });
    expect(result.current.config).toEqual(foreign);
  });

  it("discards a failed self-write fingerprint and rethrows", async () => {
    mocks.saveCategoryConfig.mockRejectedValue(new Error("disk full"));
    const { result } = renderHook(() => useCategoryConfig("connection-a"));
    await waitFor(() => expect(result.current.loaded).toBe(true));
    const next = { ...baseConfig, continueWindowMinutes: 45 };

    await expect(
      act(async () => result.current.updateConfig(next)),
    ).rejects.toThrow("disk full");
    act(() => mocks.configListener?.(next));
    expect(result.current.config).toEqual(next);
  });

  it("skips subscriptions without a connection and cleans them up on unmount", async () => {
    const empty = renderHook(() => useCategoryConfig(""));
    expect(mocks.onCategoryConfigChange).not.toHaveBeenCalled();
    empty.unmount();

    const active = renderHook(() => useCategoryConfig("connection-a"));
    active.unmount();
    await waitFor(() => expect(mocks.cleanup).toHaveBeenCalledOnce());
  });
});

describe("remote category synchronization", () => {
  async function flushSync() {
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });
  }

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-12T12:00:00Z"));
    vi.resetAllMocks();
    mocks.fetchRemoteCategoryConfig.mockResolvedValue({
      categories: [{ id: "remote", label: "Remote", children: [] }],
      continueWindowMinutes: 25,
    });
    mocks.loadCategoryConfig.mockResolvedValue(baseConfig);
    mocks.saveCategoryConfig.mockResolvedValue(undefined);
  });

  afterEach(() => vi.useRealTimers());

  it.each([
    ["", "https://config.test/categories.json"],
    ["connection-a", undefined],
    ["connection-a", "file:///tmp/categories.json"],
  ] as const)("skips invalid sync inputs %#", (connectionId, sourceUrl) => {
    renderHook(() => useCategoryRemoteSync(connectionId, sourceUrl));
    expect(mocks.fetchRemoteCategoryConfig).not.toHaveBeenCalled();
  });

  it("merges portable remote fields while preserving local settings", async () => {
    const { unmount } = renderHook(() =>
      useCategoryRemoteSync("connection-a", `  ${baseConfig.sourceUrl}  `),
    );

    await flushSync();
    expect(mocks.saveCategoryConfig).toHaveBeenCalledOnce();
    expect(mocks.fetchRemoteCategoryConfig).toHaveBeenCalledWith(
      baseConfig.sourceUrl,
      "connection-a",
    );
    expect(mocks.saveCategoryConfig).toHaveBeenCalledWith("connection-a", {
      ...baseConfig,
      categories: [{ id: "remote", label: "Remote", children: [] }],
      continueWindowMinutes: 25,
      sourceSyncedAt: Math.floor(Date.now() / 1000),
    });
    unmount();
  });

  it("keeps the local interval when remote data omits it", async () => {
    mocks.fetchRemoteCategoryConfig.mockResolvedValue({ categories: [] });
    renderHook(() =>
      useCategoryRemoteSync("connection-a", baseConfig.sourceUrl),
    );

    await flushSync();
    expect(mocks.saveCategoryConfig).toHaveBeenCalledOnce();
    expect(mocks.saveCategoryConfig.mock.calls[0][1].continueWindowMinutes).toBe(15);
  });

  it("does not save failed fetches or stale source URLs", async () => {
    mocks.fetchRemoteCategoryConfig.mockResolvedValueOnce(null);
    const first = renderHook(() =>
      useCategoryRemoteSync("connection-a", baseConfig.sourceUrl),
    );
    await flushSync();
    expect(mocks.saveCategoryConfig).not.toHaveBeenCalled();
    first.unmount();

    mocks.fetchRemoteCategoryConfig.mockResolvedValueOnce({ categories: [] });
    mocks.loadCategoryConfig.mockResolvedValueOnce({
      ...baseConfig,
      sourceUrl: "https://other.test/config.json",
    });
    renderHook(() =>
      useCategoryRemoteSync("connection-a", baseConfig.sourceUrl),
    );
    await flushSync();
    expect(mocks.saveCategoryConfig).not.toHaveBeenCalled();
  });
});
