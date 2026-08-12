import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PausedTimerData } from "./pauseStore";

const storeMocks = vi.hoisted(() => ({
  mutateArrayStore: vi.fn(),
  migrateLegacyStore: vi.fn(),
}));

vi.mock("./arrayStore", () => ({
  mutateArrayStore: storeMocks.mutateArrayStore,
}));
vi.mock("./storeMigrations", () => ({
  migrateLegacyStore: storeMocks.migrateLegacyStore,
}));

import {
  addPausedTimer,
  clearAllPausedTimers,
  loadPausedTimers,
  removePausedTimer,
  removeResumedTimer,
} from "./pauseStore";

const paused: PausedTimerData = {
  id: "resumed-timer",
  connectionId: "connection-a",
  projectId: 1,
  activityId: 2,
  project: "Project",
  projectColor: "",
  activityColor: "",
  customerColor: "",
  activity: "Activity",
  description: "",
  tags: [],
  pausedAt: "2026-01-01T00:00:00.000Z",
};

describe("paused timer resume reconciliation", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    storeMocks.migrateLegacyStore.mockResolvedValue([paused]);
  });

  it("hides a resumed timer and retries a failed local removal", async () => {
    storeMocks.mutateArrayStore
      .mockRejectedValueOnce(new Error("disk unavailable"))
      .mockResolvedValueOnce([]);

    await expect(removeResumedTimer(paused.id)).resolves.toEqual([]);
    await vi.waitFor(() =>
      expect(storeMocks.mutateArrayStore).toHaveBeenCalledTimes(2),
    );
  });

  it("loads migrated timers and hides none without pending removals", async () => {
    await expect(loadPausedTimers()).resolves.toEqual([paused]);
    expect(storeMocks.migrateLegacyStore).toHaveBeenCalledWith({
      type: "pausedTimer",
      generatedId: expect.any(String),
    });
  });

  it("returns an empty list when migration fails", async () => {
    storeMocks.migrateLegacyStore.mockRejectedValue(new Error("corrupt store"));
    await expect(loadPausedTimers()).resolves.toEqual([]);
  });

  it("adds a timer uniquely with the retention policy", async () => {
    storeMocks.mutateArrayStore.mockResolvedValue([paused]);

    await expect(addPausedTimer(paused)).resolves.toEqual([paused]);
    expect(storeMocks.mutateArrayStore).toHaveBeenCalledWith("pausedTimers", {
      type: "appendUnique",
      value: paused,
      identity: { id: paused.id },
      limit: 10,
      sortField: "pausedAt",
    });
  });

  it("removes a timer by id and returns the committed list", async () => {
    storeMocks.mutateArrayStore.mockResolvedValue([]);
    await expect(removePausedTimer(paused.id)).resolves.toEqual([]);
    expect(storeMocks.mutateArrayStore).toHaveBeenCalledWith("pausedTimers", {
      type: "removeMatching",
      identity: { id: paused.id },
    });
  });

  it("removes a resumed timer immediately after a successful write", async () => {
    storeMocks.mutateArrayStore.mockResolvedValue([]);
    await expect(removeResumedTimer(paused.id)).resolves.toEqual([]);
    expect(storeMocks.mutateArrayStore).toHaveBeenCalledOnce();
  });

  it("clears every paused timer atomically", async () => {
    storeMocks.mutateArrayStore.mockResolvedValue([]);
    await expect(clearAllPausedTimers()).resolves.toBeUndefined();
    expect(storeMocks.mutateArrayStore).toHaveBeenCalledWith("pausedTimers", {
      type: "clear",
    });
  });

  it("keeps failed removals hidden while a background retry is in flight", async () => {
    const other = { ...paused, id: "other" };
    storeMocks.migrateLegacyStore.mockResolvedValue([paused, other]);
    let resolveRetry!: (value: PausedTimerData[]) => void;
    storeMocks.mutateArrayStore
      .mockRejectedValueOnce(new Error("first"))
      .mockImplementationOnce(() => new Promise((resolve) => { resolveRetry = resolve; }));

    await expect(removeResumedTimer(paused.id)).resolves.toEqual([other]);
    await expect(loadPausedTimers()).resolves.toEqual([other]);
    expect(storeMocks.mutateArrayStore).toHaveBeenCalledTimes(2);
    resolveRetry([other]);
    await vi.waitFor(() => expect(storeMocks.mutateArrayStore).toHaveBeenCalledTimes(2));
  });

  it("keeps a removal pending when its background retry also fails", async () => {
    const retrying = { ...paused, id: "retry-failure" };
    storeMocks.migrateLegacyStore.mockResolvedValue([retrying]);
    storeMocks.mutateArrayStore.mockRejectedValue(new Error("disk locked"));
    await expect(removeResumedTimer(retrying.id)).resolves.toEqual([]);
    await vi.waitFor(() => expect(storeMocks.mutateArrayStore).toHaveBeenCalledTimes(2));
  });
});
