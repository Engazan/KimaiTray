import { describe, expect, it, vi } from "vitest";

const core = vi.hoisted(() => ({ invoke: vi.fn() }));
vi.mock("@tauri-apps/api/core", () => core);

import { getIdleSeconds } from "./idleApi";

describe("idle API", () => {
  it("returns the duration reported by the native idle detector", async () => {
    core.invoke.mockResolvedValue(42);

    await expect(getIdleSeconds()).resolves.toBe(42);
    expect(core.invoke).toHaveBeenCalledWith("get_idle_seconds");
  });
});
