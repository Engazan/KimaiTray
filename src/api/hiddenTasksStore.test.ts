import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  mutateScopedStore: vi.fn(),
  migrateLegacyStore: vi.fn(),
}));

vi.mock("./scopedStore", () => ({ mutateScopedStore: mocks.mutateScopedStore }));
vi.mock("./storeMigrations", () => ({
  migrateLegacyStore: mocks.migrateLegacyStore,
}));

import {
  addHiddenTask,
  clearHiddenTasks,
  loadHiddenTasks,
  removeHiddenTask,
} from "./hiddenTasksStore";

describe("hidden recent-task persistence", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.migrateLegacyStore.mockResolvedValue(["task-a"]);
    mocks.mutateScopedStore.mockResolvedValue([]);
  });

  it("does not read a shared scope for an empty connection id", async () => {
    await expect(loadHiddenTasks("")).resolves.toEqual([]);
    expect(mocks.migrateLegacyStore).not.toHaveBeenCalled();
  });

  it("loads the migrated connection-scoped task list", async () => {
    await expect(loadHiddenTasks("connection-a")).resolves.toEqual(["task-a"]);
    expect(mocks.migrateLegacyStore).toHaveBeenCalledWith({
      type: "hiddenTasks",
      connectionId: "connection-a",
    });
  });

  it("falls back to an empty list after a migration failure", async () => {
    mocks.migrateLegacyStore.mockRejectedValue(new Error("corrupt store"));
    await expect(loadHiddenTasks("connection-a")).resolves.toEqual([]);
  });

  it("does not duplicate an already hidden task", async () => {
    await expect(addHiddenTask("connection-a", "task-a")).resolves.toEqual([
      "task-a",
    ]);
    expect(mocks.mutateScopedStore).not.toHaveBeenCalled();
  });

  it("adds and removes tasks through the atomic scoped store", async () => {
    mocks.migrateLegacyStore.mockResolvedValue([]);
    mocks.mutateScopedStore
      .mockResolvedValueOnce(["task-b"])
      .mockResolvedValueOnce([]);

    await expect(addHiddenTask("connection-a", "task-b")).resolves.toEqual([
      "task-b",
    ]);
    await expect(removeHiddenTask("connection-a", "task-b")).resolves.toEqual(
      [],
    );
    expect(mocks.mutateScopedStore).toHaveBeenNthCalledWith(
      1,
      "hiddenRecentTasksByConnection",
      "connection-a",
      { type: "addString", value: "task-b" },
    );
    expect(mocks.mutateScopedStore).toHaveBeenNthCalledWith(
      2,
      "hiddenRecentTasksByConnection",
      "connection-a",
      { type: "removeString", value: "task-b" },
    );
  });

  it("migrates before clearing the connection scope", async () => {
    await expect(clearHiddenTasks("connection-a")).resolves.toBeUndefined();
    expect(mocks.migrateLegacyStore).toHaveBeenCalledBefore(
      mocks.mutateScopedStore,
    );
    expect(mocks.mutateScopedStore).toHaveBeenCalledWith(
      "hiddenRecentTasksByConnection",
      "connection-a",
      { type: "clearStrings" },
    );
  });
});
