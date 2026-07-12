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

import { removeResumedTimer } from "./pauseStore";

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
});
