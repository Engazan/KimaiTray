// @vitest-environment jsdom

import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const idleMocks = vi.hoisted(() => ({ getIdleSeconds: vi.fn() }));
vi.mock("../api/idleApi", () => idleMocks);

import { useIdleDetection } from "./useIdleDetection";

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

describe("idle detection polling", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T12:00:00.000Z"));
    idleMocks.getIdleSeconds.mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("ignores an in-flight result after detection is disabled", async () => {
    const pending = deferred<number>();
    idleMocks.getIdleSeconds.mockReturnValueOnce(pending.promise);
    const { result, rerender } = renderHook(
      ({ enabled }) => useIdleDetection(enabled, 5, true),
      { initialProps: { enabled: true } },
    );

    rerender({ enabled: false });
    await act(async () => pending.resolve(600));

    expect(result.current.idleState).toBe("active");
    expect(result.current.idleStartedAt).toBeNull();
  });

  it("waits for a poll to finish before scheduling another one", async () => {
    const first = deferred<number>();
    idleMocks.getIdleSeconds
      .mockReturnValueOnce(first.promise)
      .mockResolvedValue(0);
    renderHook(() => useIdleDetection(true, 5, true));

    await act(async () => vi.advanceTimersByTimeAsync(30_000));
    expect(idleMocks.getIdleSeconds).toHaveBeenCalledTimes(1);

    await act(async () => first.resolve(0));
    await act(async () => vi.advanceTimersByTimeAsync(9_999));
    expect(idleMocks.getIdleSeconds).toHaveBeenCalledTimes(1);

    await act(async () => vi.advanceTimersByTimeAsync(1));
    expect(idleMocks.getIdleSeconds).toHaveBeenCalledTimes(2);
  });

  it("preserves the idle and returned state transition", async () => {
    idleMocks.getIdleSeconds
      .mockResolvedValueOnce(600)
      .mockResolvedValueOnce(0);
    const { result } = renderHook(() => useIdleDetection(true, 5, true));

    await act(async () => Promise.resolve());
    expect(result.current.idleState).toBe("idle");
    await act(async () => vi.advanceTimersByTimeAsync(10_000));
    expect(result.current.idleState).toBe("returned");
    expect(result.current.idleDurationSeconds).toBe(610);
  });

  it("updates a continuing idle period, dismisses it and returns to active", async () => {
    idleMocks.getIdleSeconds
      .mockResolvedValueOnce(300)
      .mockResolvedValueOnce(420)
      .mockResolvedValueOnce(0);
    const { result } = renderHook(() => useIdleDetection(true, 5, true));
    await act(async () => Promise.resolve());
    expect(result.current.idleDurationSeconds).toBe(300);
    await act(async () => vi.advanceTimersByTimeAsync(10_000));
    expect(result.current.idleDurationSeconds).toBe(420);
    act(() => result.current.dismissIdle());
    expect(result.current.idleState).toBe("handled");
    await act(async () => vi.advanceTimersByTimeAsync(10_000));
    expect(result.current.idleState).toBe("active");
    expect(result.current.idleStartedAt).toBeNull();
  });

  it("dismisses safely before any idle period and disables without a timer", () => {
    const { result, rerender } = renderHook(
      ({ enabled, timer }) => useIdleDetection(enabled, 5, timer),
      { initialProps: { enabled: false, timer: false } },
    );
    act(() => result.current.dismissIdle());
    expect(result.current.idleState).toBe("handled");
    rerender({ enabled: true, timer: false });
    expect(result.current.idleState).toBe("active");
    expect(idleMocks.getIdleSeconds).not.toHaveBeenCalled();
  });

  it("continues polling after platform errors and cancels scheduled work", async () => {
    idleMocks.getIdleSeconds.mockRejectedValueOnce(new Error("unsupported")).mockResolvedValueOnce(0);
    const { unmount } = renderHook(() => useIdleDetection(true, 5, true));
    await act(async () => Promise.resolve());
    await act(async () => vi.advanceTimersByTimeAsync(10_000));
    expect(idleMocks.getIdleSeconds).toHaveBeenCalledTimes(2);
    unmount();
    await act(async () => vi.advanceTimersByTimeAsync(20_000));
    expect(idleMocks.getIdleSeconds).toHaveBeenCalledTimes(2);
  });
});
