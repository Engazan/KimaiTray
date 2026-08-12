// @vitest-environment jsdom

import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  checkForUpdate: vi.fn(),
  installUpdate: vi.fn(),
  info: vi.fn(),
  debug: vi.fn(),
  error: vi.fn(),
}));

vi.mock("../api/updater", () => ({
  checkForUpdate: mocks.checkForUpdate,
  installUpdate: mocks.installUpdate,
}));
vi.mock("../utils/logger", () => ({
  logger: { info: mocks.info, debug: mocks.debug, error: mocks.error },
}));

import { useUpdater } from "./useUpdater";

const update = { version: "2.0.0", body: "New features" };

describe("application updater state", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.checkForUpdate.mockResolvedValue(null);
    mocks.installUpdate.mockResolvedValue(undefined);
  });

  it("marks the app up to date when no update exists", async () => {
    const { result } = renderHook(() => useUpdater(false));

    await waitFor(() => expect(result.current.upToDate).toBe(true));
    expect(result.current.checking).toBe(false);
    expect(result.current.available).toBe(false);
    expect(mocks.debug).toHaveBeenCalledWith("App is up to date");
  });

  it("offers a manual install with release details", async () => {
    mocks.checkForUpdate.mockResolvedValue(update);
    const { result } = renderHook(() => useUpdater(false));

    await waitFor(() => expect(result.current.available).toBe(true));
    expect(result.current).toMatchObject({
      version: "2.0.0",
      body: "New features",
      downloading: false,
      error: null,
    });
    expect(mocks.info).toHaveBeenCalledWith("Update available: 2.0.0");

    await act(async () => result.current.install?.());
    expect(mocks.installUpdate).toHaveBeenCalledWith(update);
  });

  it("starts installing automatically when enabled", async () => {
    mocks.checkForUpdate.mockResolvedValue({ ...update, body: undefined });
    const { result } = renderHook(() => useUpdater(true));

    await waitFor(() => expect(mocks.installUpdate).toHaveBeenCalledOnce());
    expect(result.current.body).toBeNull();
    expect(result.current.downloading).toBe(true);
  });

  it("exposes installation failures and stops the spinner", async () => {
    mocks.checkForUpdate.mockResolvedValue(update);
    mocks.installUpdate.mockRejectedValue(new Error("signature invalid"));
    const { result } = renderHook(() => useUpdater(false));
    await waitFor(() => expect(result.current.install).not.toBeNull());

    await act(async () => result.current.install?.());

    expect(result.current.downloading).toBe(false);
    expect(result.current.error).toBe("signature invalid");
    expect(mocks.error).toHaveBeenCalledWith(
      "Update install failed: signature invalid",
    );
  });

  it("exposes check failures and allows a later retry", async () => {
    mocks.checkForUpdate
      .mockRejectedValueOnce("offline")
      .mockResolvedValueOnce(null);
    const { result } = renderHook(() => useUpdater(false));

    await waitFor(() => expect(result.current.error).toBe("offline"));
    await act(async () => result.current.checkNow());

    expect(result.current.upToDate).toBe(true);
    expect(result.current.error).toBeNull();
    expect(mocks.checkForUpdate).toHaveBeenCalledTimes(2);
  });

  it("shares a check already in flight", async () => {
    let finish: ((value: null) => void) | undefined;
    mocks.checkForUpdate.mockReturnValue(
      new Promise<null>((resolve) => { finish = resolve; }),
    );
    const { result } = renderHook(() => useUpdater(false));
    await waitFor(() => expect(result.current.checking).toBe(true));

    let first: Promise<void> | undefined;
    let second: Promise<void> | undefined;
    act(() => {
      first = result.current.checkNow();
      second = result.current.checkNow();
    });

    expect(first).toBe(second);
    expect(mocks.checkForUpdate).toHaveBeenCalledOnce();
    await act(async () => finish?.(null));
  });
});
