// @vitest-environment jsdom

import { renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const core = vi.hoisted(() => ({ invoke: vi.fn() }));
vi.mock("@tauri-apps/api/core", () => core);

const detected = {
  os: "linux",
  session: "wayland",
  trayBackend: "appindicator",
  supportsTrayClickActions: false,
  supportsNativePopupCorners: false,
  supportsGlobalShortcuts: true,
  supportsWindowPositioning: true,
  supportsAlwaysOnTop: true,
} as const;

describe("platform capability detection", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.resetAllMocks();
  });

  it("returns conservative capabilities before detection", async () => {
    const { currentPlatform } = await import("./platform");
    expect(currentPlatform()).toEqual({
      os: "unknown",
      session: "unknown",
      trayBackend: "native",
      supportsTrayClickActions: false,
      supportsNativePopupCorners: false,
      supportsGlobalShortcuts: false,
      supportsWindowPositioning: false,
      supportsAlwaysOnTop: false,
    });
  });

  it("shares concurrent native detection and caches the result", async () => {
    let finish: ((value: typeof detected) => void) | undefined;
    core.invoke.mockReturnValue(
      new Promise<typeof detected>((resolve) => { finish = resolve; }),
    );
    const { currentPlatform, getPlatformInfo } = await import("./platform");

    const first = getPlatformInfo();
    const second = getPlatformInfo();
    expect(core.invoke).toHaveBeenCalledOnce();
    finish?.(detected);

    await expect(first).resolves.toEqual(detected);
    await expect(second).resolves.toEqual(detected);
    expect(currentPlatform()).toEqual(detected);
    await expect(getPlatformInfo()).resolves.toEqual(detected);
    expect(core.invoke).toHaveBeenCalledOnce();
  });

  it("caches the fallback after native detection fails", async () => {
    core.invoke.mockRejectedValue(new Error("command unavailable"));
    const { getPlatformInfo } = await import("./platform");

    const first = await getPlatformInfo();
    const second = await getPlatformInfo();

    expect(first.os).toBe("unknown");
    expect(second).toBe(first);
    expect(core.invoke).toHaveBeenCalledOnce();
  });

  it("updates the React hook after asynchronous detection", async () => {
    core.invoke.mockResolvedValue(detected);
    const { usePlatform } = await import("./platform");
    const { result } = renderHook(() => usePlatform());

    expect(result.current.os).toBe("unknown");
    await waitFor(() => expect(result.current.os).toBe("linux"));
    expect(result.current.supportsGlobalShortcuts).toBe(true);
  });
});
