// @vitest-environment jsdom

import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  NoTimerReminderTracker,
  type TimerPresence,
  useNoTimerReminder,
} from "./useNoTimerReminder";

const mocks = vi.hoisted(() => ({
  hideFullscreenReminder: vi.fn(),
  showFullscreenReminder: vi.fn(),
  listen: vi.fn(),
  unlisten: vi.fn(),
  loggerError: vi.fn(),
  tick: null as null | (() => void),
}));

type ReminderProps = {
  enabled: boolean;
  thresholdMinutes: number;
  presence: TimerPresence;
};

vi.mock("../api/reminderWindow", () => ({
  hideFullscreenReminder: mocks.hideFullscreenReminder,
  showFullscreenReminder: mocks.showFullscreenReminder,
}));
vi.mock("@tauri-apps/api/window", () => ({
  getCurrentWindow: () => ({ listen: mocks.listen }),
}));
vi.mock("../utils/logger", () => ({ logger: { error: mocks.loggerError } }));

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-01-01T12:00:00Z"));
  vi.clearAllMocks();
  mocks.tick = null;
  mocks.showFullscreenReminder.mockResolvedValue(undefined);
  mocks.hideFullscreenReminder.mockResolvedValue(undefined);
  mocks.listen.mockImplementation(async (_event, callback) => {
    mocks.tick = callback;
    return mocks.unlisten;
  });
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("NoTimerReminderTracker", () => {
  it("shows once after the configured continuous period without a timer", () => {
    const tracker = new NoTimerReminderTracker();

    expect(tracker.update(0, true, 5_000, "stopped")).toBe("none");
    expect(tracker.remainingMs(2_000, 5_000)).toBe(3_000);
    expect(tracker.update(4_999, true, 5_000, "stopped")).toBe("none");
    expect(tracker.update(5_000, true, 5_000, "stopped")).toBe("show");
    expect(tracker.update(10_000, true, 5_000, "stopped")).toBe("none");
  });

  it("hides and rearms after a timer starts", () => {
    const tracker = new NoTimerReminderTracker();

    tracker.update(0, true, 1_000, "stopped");
    expect(tracker.update(1_000, true, 1_000, "stopped")).toBe("show");
    expect(tracker.update(1_500, true, 1_000, "running")).toBe("hide");
    expect(tracker.update(2_000, true, 1_000, "stopped")).toBe("none");
    expect(tracker.update(3_000, true, 1_000, "stopped")).toBe("show");
  });

  it("does not count time while timer presence is unknown or disabled", () => {
    const tracker = new NoTimerReminderTracker();

    expect(tracker.update(0, true, 1_000, "unknown")).toBe("none");
    expect(tracker.update(5_000, true, 1_000, "stopped")).toBe("none");
    expect(tracker.update(6_000, false, 1_000, "stopped")).toBe("none");
    expect(tracker.update(10_000, true, 1_000, "stopped")).toBe("none");
  });

  it("applies a shorter threshold immediately", () => {
    const tracker = new NoTimerReminderTracker();

    tracker.update(0, true, 10_000, "stopped");
    expect(tracker.update(5_000, true, 4_000, "stopped")).toBe("show");
  });
});

describe("useNoTimerReminder", () => {
  it("schedules, shows, hides and rearms the reminder", async () => {
    const initialProps: ReminderProps = {
      enabled: true,
      thresholdMinutes: 1 / 60,
      presence: "stopped",
    };
    const { rerender, unmount } = renderHook(
      (props: ReminderProps) => useNoTimerReminder(props),
      { initialProps },
    );

    expect(mocks.showFullscreenReminder).not.toHaveBeenCalled();
    await act(async () => vi.advanceTimersByTime(1_000));
    expect(mocks.showFullscreenReminder).toHaveBeenCalledWith({ kind: "timer" });

    rerender({ enabled: true, thresholdMinutes: 1 / 60, presence: "running" as const });
    expect(mocks.hideFullscreenReminder).toHaveBeenCalledTimes(1);
    rerender({ enabled: true, thresholdMinutes: 1 / 60, presence: "stopped" as const });
    await act(async () => vi.advanceTimersByTime(1_000));
    expect(mocks.showFullscreenReminder).toHaveBeenCalledTimes(2);

    unmount();
    await Promise.resolve();
    expect(mocks.unlisten).toHaveBeenCalledTimes(1);
  });

  it("evaluates immediately when options change and on application ticks", () => {
    const initialProps: ReminderProps = {
      enabled: true,
      thresholdMinutes: 10,
      presence: "stopped",
    };
    const { rerender } = renderHook(
      (props: ReminderProps) => useNoTimerReminder(props),
      { initialProps },
    );

    vi.setSystemTime(new Date("2026-01-01T12:05:00Z"));
    rerender({ enabled: true, thresholdMinutes: 4, presence: "stopped" as const });
    expect(mocks.showFullscreenReminder).toHaveBeenCalledTimes(1);

    act(() => mocks.tick?.());
    expect(mocks.showFullscreenReminder).toHaveBeenCalledTimes(1);
    rerender({ enabled: false, thresholdMinutes: 4, presence: "stopped" as const });
    expect(mocks.hideFullscreenReminder).toHaveBeenCalledTimes(1);
  });

  it("logs failures from both reminder window actions", async () => {
    mocks.showFullscreenReminder.mockRejectedValueOnce(new Error("show failed"));
    const initialProps: ReminderProps = {
      enabled: true,
      thresholdMinutes: 0,
      presence: "stopped",
    };
    const { rerender } = renderHook(
      (props: ReminderProps) => useNoTimerReminder(props),
      { initialProps },
    );
    await act(async () => Promise.resolve());
    expect(mocks.loggerError).toHaveBeenCalledWith(
      expect.stringContaining("Failed to show timer reminder"),
    );

    mocks.hideFullscreenReminder.mockRejectedValueOnce("hide failed");
    rerender({ enabled: true, thresholdMinutes: 0, presence: "unknown" as const });
    await act(async () => Promise.resolve());
    expect(mocks.loggerError).toHaveBeenCalledWith(
      expect.stringContaining("Failed to hide timer reminder"),
    );
  });
});
