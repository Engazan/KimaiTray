import { describe, expect, it } from "vitest";
import { NoTimerReminderTracker } from "./useNoTimerReminder";

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
