import { beforeEach, describe, expect, it, vi } from "vitest";

const core = vi.hoisted(() => ({ invoke: vi.fn() }));
vi.mock("@tauri-apps/api/core", () => core);

import { openKimaiInBrowser } from "./trayApi";

describe("tray API", () => {
  beforeEach(() => vi.resetAllMocks());

  it("opens the configured Kimai URL through the native tray command", async () => {
    core.invoke.mockResolvedValue(undefined);

    await expect(openKimaiInBrowser()).resolves.toBeUndefined();

    expect(core.invoke).toHaveBeenCalledWith("open_kimai_in_browser");
  });
});
