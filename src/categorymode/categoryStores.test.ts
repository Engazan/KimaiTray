import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CategoryConfig, CategoryLastActivity } from "./types";

const mocks = vi.hoisted(() => ({
  load: vi.fn(),
  onKeyChange: vi.fn(),
  mutateScopedStore: vi.fn(),
  migrateLegacyStore: vi.fn(),
}));

vi.mock("@tauri-apps/plugin-store", () => ({ load: mocks.load }));
vi.mock("../api/scopedStore", () => ({
  mutateScopedStore: mocks.mutateScopedStore,
}));
vi.mock("../api/storeMigrations", () => ({
  migrateLegacyStore: mocks.migrateLegacyStore,
}));

import {
  loadCategoryConfig,
  onCategoryConfigChange,
  saveCategoryConfig,
} from "./categoryConfigStore";
import {
  loadCategoryLastActivity,
  saveCategoryLastActivity,
} from "./categoryLastActivityStore";
import { cloneDefaultCategoryConfig } from "./defaultCategoryConfig";

const config: CategoryConfig = {
  defaultProjectId: 10,
  continueWindowMinutes: 20,
  categories: [],
};

const lastActivity: CategoryLastActivity = {
  leafId: "support",
  label: "Support",
  projectId: 10,
  activityId: 20,
  startedAt: 1_700_000_000,
};

describe("category mode persistence", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.load.mockResolvedValue({ onKeyChange: mocks.onKeyChange });
    mocks.migrateLegacyStore.mockResolvedValue({});
    mocks.mutateScopedStore.mockResolvedValue(undefined);
  });

  it("returns independent default clones without a connection", async () => {
    const first = await loadCategoryConfig("");
    const second = await loadCategoryConfig("");
    first.categories.push({ id: "changed", label: "", children: [] });

    expect(second).toEqual(cloneDefaultCategoryConfig());
    expect(second.categories).toEqual([]);
    expect(mocks.migrateLegacyStore).not.toHaveBeenCalled();
  });

  it("loads a migrated config over current defaults", async () => {
    mocks.migrateLegacyStore.mockResolvedValue({
      "connection-a": { categories: [], internalProjectId: 55 },
    });

    await expect(loadCategoryConfig("connection-a")).resolves.toMatchObject({
      categories: [],
      defaultProjectId: 55,
      continueWindowMinutes: 15,
    });
    expect(mocks.migrateLegacyStore).toHaveBeenCalledWith({
      type: "categoryConfig",
    });
  });

  it("preserves an explicit project id over the legacy field", async () => {
    mocks.migrateLegacyStore.mockResolvedValue({
      "connection-a": {
        ...config,
        internalProjectId: 55,
      },
    });

    const loaded = await loadCategoryConfig("connection-a");
    expect(loaded.defaultProjectId).toBe(10);
    expect(loaded).not.toHaveProperty("internalProjectId");
  });

  it("falls back to defaults when config migration fails", async () => {
    mocks.migrateLegacyStore.mockRejectedValue(new Error("corrupt store"));
    await expect(loadCategoryConfig("connection-a")).resolves.toEqual(
      cloneDefaultCategoryConfig(),
    );
  });

  it("saves only a non-empty connection scope", async () => {
    await saveCategoryConfig("", config);
    expect(mocks.mutateScopedStore).not.toHaveBeenCalled();

    await saveCategoryConfig("connection-a", config);
    expect(mocks.mutateScopedStore).toHaveBeenCalledWith(
      "categoryConfig",
      "connection-a",
      { type: "set", value: config },
    );
  });

  it("normalizes cross-window config changes and returns the unlisten callback", async () => {
    const unlisten = vi.fn();
    let listener: ((map: Record<string, CategoryConfig>) => void) | undefined;
    mocks.onKeyChange.mockImplementation((_key, cb) => {
      listener = cb;
      return Promise.resolve(unlisten);
    });
    const callback = vi.fn();

    await expect(
      onCategoryConfigChange("connection-a", callback),
    ).resolves.toBe(unlisten);
    listener?.({ "connection-a": config });
    listener?.({});

    expect(mocks.onKeyChange).toHaveBeenCalledWith(
      "categoryConfig",
      expect.any(Function),
    );
    expect(callback).toHaveBeenNthCalledWith(1, config);
    expect(callback).toHaveBeenNthCalledWith(2, cloneDefaultCategoryConfig());
  });

  it("loads and saves the last activity by connection", async () => {
    mocks.migrateLegacyStore.mockResolvedValue({
      "connection-a": lastActivity,
    });

    await expect(loadCategoryLastActivity("")).resolves.toBeNull();
    await expect(loadCategoryLastActivity("connection-a")).resolves.toEqual(
      lastActivity,
    );
    await saveCategoryLastActivity("connection-a", lastActivity);

    expect(mocks.migrateLegacyStore).toHaveBeenCalledWith({
      type: "categoryLastActivity",
    });
    expect(mocks.mutateScopedStore).toHaveBeenCalledWith(
      "categoryLastActivity",
      "connection-a",
      { type: "set", value: lastActivity },
    );
  });

  it("returns null on last-activity migration failures and skips empty saves", async () => {
    mocks.migrateLegacyStore.mockRejectedValue(new Error("corrupt store"));

    await expect(loadCategoryLastActivity("connection-a")).resolves.toBeNull();
    await saveCategoryLastActivity("", lastActivity);
    expect(mocks.mutateScopedStore).not.toHaveBeenCalled();
  });
});
