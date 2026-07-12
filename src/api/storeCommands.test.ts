import { beforeEach, describe, expect, it, vi } from "vitest";

const core = vi.hoisted(() => ({ invoke: vi.fn() }));
vi.mock("@tauri-apps/api/core", () => core);

import { mutateArrayStore } from "./arrayStore";
import { mutateScopedStore } from "./scopedStore";

describe("atomic native store command adapters", () => {
  beforeEach(() => vi.resetAllMocks());

  it("returns the scoped value committed by the native transaction", async () => {
    core.invoke.mockResolvedValue({ value: ["task-a"] });
    await expect(
      mutateScopedStore<string[]>("hiddenRecentTasksByConnection", "connection-a", {
        type: "addString",
        value: "task-a",
      }),
    ).resolves.toEqual(["task-a"]);
    expect(core.invoke).toHaveBeenCalledWith("mutate_scoped_store", {
      request: {
        key: "hiddenRecentTasksByConnection",
        entryKey: "connection-a",
        mutation: { type: "addString", value: "task-a" },
      },
    });
  });

  it("returns the full array after an identity-based mutation", async () => {
    const timer = { id: "timer-a", pausedAt: "2026-07-12T00:00:00Z" };
    core.invoke.mockResolvedValue({ value: [timer] });
    await expect(
      mutateArrayStore("pausedTimers", {
        type: "appendUnique",
        value: timer,
        identity: { id: timer.id },
        limit: 10,
        sortField: "pausedAt",
      }),
    ).resolves.toEqual([timer]);
    expect(core.invoke).toHaveBeenCalledWith("mutate_array_store", {
      request: {
        key: "pausedTimers",
        mutation: {
          type: "appendUnique",
          value: timer,
          identity: { id: timer.id },
          limit: 10,
          sortField: "pausedAt",
        },
      },
    });
  });
});
