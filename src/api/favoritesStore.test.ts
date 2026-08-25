import { beforeEach, describe, expect, it, vi } from "vitest";
import type { FavoriteTask } from "../types";

const mocks = vi.hoisted(() => ({
  load: vi.fn(),
  get: vi.fn(),
  invoke: vi.fn(),
  mutateArrayStore: vi.fn(),
}));

vi.mock("@tauri-apps/plugin-store", () => ({ load: mocks.load }));
vi.mock("@tauri-apps/api/core", () => ({ invoke: mocks.invoke }));
vi.mock("./arrayStore", () => ({ mutateArrayStore: mocks.mutateArrayStore }));

import {
  addFavorite,
  loadFavorites,
  moveFavorites,
  removeFavorite,
} from "./favoritesStore";

function favorite(key: string, connectionId?: string, baseUrl?: string): FavoriteTask {
  return {
    key,
    connectionId,
    baseUrl,
    projectId: 1,
    activityId: 2,
    project: "Project",
    activity: "Activity",
    customer: "Customer",
    description: "",
    tags: [],
    projectColor: "",
    activityColor: "",
    customerColor: "",
  };
}

describe("favorite task persistence", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.load.mockResolvedValue({ get: mocks.get });
    mocks.get.mockResolvedValue([]);
  });

  it("loads only favorites owned by the active connection", async () => {
    mocks.get.mockResolvedValue([
      favorite("a", "connection-a"),
      favorite("b", "connection-b"),
    ]);

    await expect(loadFavorites("connection-a")).resolves.toEqual([
      favorite("a", "connection-a"),
    ]);
    expect(mocks.load).toHaveBeenCalledWith("settings.json", {
      defaults: {},
      autoSave: true,
    });
  });

  it("migrates legacy project-activity keys when a favorite has a note", async () => {
    const legacy = { ...favorite("1-2", "connection-a"), description: "A note" };
    const migrated = {
      ...legacy,
      key: "1-2:A%20note",
    };
    mocks.get.mockResolvedValue([legacy]);
    mocks.mutateArrayStore
      .mockResolvedValueOnce([legacy, migrated])
      .mockResolvedValueOnce([migrated]);

    await expect(loadFavorites("connection-a")).resolves.toEqual([migrated]);
    expect(mocks.mutateArrayStore).toHaveBeenNthCalledWith(1, "favoriteTasks", {
      type: "appendUnique",
      value: migrated,
      identity: { key: migrated.key, connectionId: "connection-a" },
    });
    expect(mocks.mutateArrayStore).toHaveBeenNthCalledWith(2, "favoriteTasks", {
      type: "removeMatching",
      identity: { key: "1-2", connectionId: "connection-a" },
    });
  });

  it("keeps legacy favorites available when key migration cannot be persisted", async () => {
    const legacy = { ...favorite("1-2", "connection-a"), description: "A note" };
    mocks.get.mockResolvedValue([legacy]);
    mocks.mutateArrayStore.mockRejectedValue(new Error("disk unavailable"));

    await expect(loadFavorites("connection-a")).resolves.toEqual([legacy]);
  });

  it("claims matching legacy favorites before filtering", async () => {
    const claimed = favorite("legacy", "connection-a", "https://kimai.test");
    mocks.get.mockResolvedValue([
      favorite("legacy", undefined, "https://kimai.test"),
    ]);
    mocks.invoke.mockResolvedValue({ value: [claimed] });

    await expect(
      loadFavorites("connection-a", "https://kimai.test"),
    ).resolves.toEqual([claimed]);
    expect(mocks.invoke).toHaveBeenCalledWith("claim_legacy_favorites_store", {
      request: {
        connectionId: "connection-a",
        baseUrl: "https://kimai.test",
      },
    });
  });

  it("does not claim unrelated legacy favorites", async () => {
    mocks.get.mockResolvedValue([
      favorite("other", undefined, "https://other.test"),
    ]);

    await expect(
      loadFavorites("connection-a", "https://kimai.test"),
    ).resolves.toEqual([]);
    expect(mocks.invoke).not.toHaveBeenCalled();
  });

  it("returns an empty list when plugin storage cannot be read", async () => {
    mocks.get.mockRejectedValue(new Error("disk unavailable"));

    await expect(loadFavorites("connection-a")).resolves.toEqual([]);
  });

  it("adds a favorite atomically and returns only its connection scope", async () => {
    const added = favorite("a", "connection-a");
    mocks.mutateArrayStore.mockResolvedValue([
      added,
      favorite("b", "connection-b"),
    ]);

    await expect(addFavorite(added)).resolves.toEqual([added]);
    expect(mocks.mutateArrayStore).toHaveBeenCalledWith("favoriteTasks", {
      type: "appendUnique",
      value: added,
      identity: { key: "a", connectionId: "connection-a" },
    });
  });

  it("claims legacy data before removing and retains matching legacy scope", async () => {
    const legacy = favorite("keep", undefined, "https://kimai.test");
    mocks.get.mockResolvedValue([]);
    mocks.mutateArrayStore.mockResolvedValue([
      legacy,
      favorite("other", "connection-b"),
    ]);

    await expect(
      removeFavorite("remove", "connection-a", "https://kimai.test"),
    ).resolves.toEqual([legacy]);
    expect(mocks.mutateArrayStore).toHaveBeenCalledWith("favoriteTasks", {
      type: "removeMatching",
      identity: { key: "remove", connectionId: "connection-a" },
    });
  });

  it("moves favorites only between distinct non-empty connections", async () => {
    await expect(moveFavorites("", "connection-b")).resolves.toBe(0);
    await expect(moveFavorites("connection-a", "connection-a")).resolves.toBe(0);
    expect(mocks.invoke).not.toHaveBeenCalled();

    mocks.invoke.mockResolvedValue({ count: 3 });
    await expect(
      moveFavorites(
        "connection-a",
        "connection-b",
        "https://old.test",
        "https://new.test",
      ),
    ).resolves.toBe(3);
    expect(mocks.invoke).toHaveBeenCalledWith("move_favorites_store", {
      request: {
        fromConnectionId: "connection-a",
        toConnectionId: "connection-b",
        fromBaseUrl: "https://old.test",
        toBaseUrl: "https://new.test",
      },
    });
  });
});
