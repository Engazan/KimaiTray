import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Update } from "@tauri-apps/plugin-updater";

const mocks = vi.hoisted(() => ({
  check: vi.fn(),
  relaunch: vi.fn(),
  rememberPendingChangelog: vi.fn(),
  forgetPendingChangelog: vi.fn(),
}));

vi.mock("@tauri-apps/plugin-updater", () => ({ check: mocks.check }));
vi.mock("@tauri-apps/plugin-process", () => ({ relaunch: mocks.relaunch }));
vi.mock("./changelog", () => ({
  rememberPendingChangelog: mocks.rememberPendingChangelog,
  forgetPendingChangelog: mocks.forgetPendingChangelog,
}));

import { checkForUpdate, installUpdate } from "./updater";

describe("updater operation serialization", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.relaunch.mockResolvedValue(undefined);
  });

  it("shares a concurrent check and allows a later retry", async () => {
    let resolveCheck!: (value: null) => void;
    mocks.check
      .mockImplementationOnce(
        () => new Promise<null>((resolve) => { resolveCheck = resolve; }),
      )
      .mockResolvedValueOnce(null);

    const first = checkForUpdate();
    const second = checkForUpdate();
    expect(mocks.check).toHaveBeenCalledTimes(1);

    resolveCheck(null);
    await Promise.all([first, second]);
    await checkForUpdate();
    expect(mocks.check).toHaveBeenCalledTimes(2);
  });

  it("downloads and relaunches only once for concurrent installs", async () => {
    let resolveInstall!: () => void;
    const downloadAndInstall = vi.fn(
      () => new Promise<void>((resolve) => { resolveInstall = resolve; }),
    );
    const update = {
      version: "2.1.0",
      body: "Release notes",
      downloadAndInstall,
    } as unknown as Update;

    const first = installUpdate(update);
    const second = installUpdate(update);
    expect(downloadAndInstall).toHaveBeenCalledTimes(1);

    resolveInstall();
    await Promise.all([first, second]);
    expect(mocks.rememberPendingChangelog).toHaveBeenCalledWith({
      version: "2.1.0",
      body: "Release notes",
    });
    expect(mocks.relaunch).toHaveBeenCalledTimes(1);
  });

  it("removes pending release notes when installation fails", async () => {
    const update = {
      version: "2.1.0",
      body: null,
      downloadAndInstall: vi.fn().mockRejectedValue(new Error("download failed")),
    } as unknown as Update;

    await expect(installUpdate(update)).rejects.toThrow("download failed");

    expect(mocks.rememberPendingChangelog).toHaveBeenCalledWith({
      version: "2.1.0",
      body: "",
    });
    expect(mocks.forgetPendingChangelog).toHaveBeenCalledWith("2.1.0");
    expect(mocks.relaunch).not.toHaveBeenCalled();
  });
});
