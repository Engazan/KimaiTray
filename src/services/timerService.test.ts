import { beforeEach, describe, expect, it, vi } from "vitest";
import type { KimaiClient } from "../api/kimaiClient";
import { stopTimesheet, updateTimesheet } from "../api/timesheetApi";
import { toKimaiLocal } from "../utils/time";
import { stopTimerAtIdleBoundary } from "./timerService";

vi.mock("../api/timesheetApi", () => ({
  stopTimesheet: vi.fn(), updateTimesheet: vi.fn(),
}));

const client: KimaiClient = {
  baseUrl: "https://kimai.test", connectionId: "work", cacheScope: "work:1",
  get: vi.fn(), post: vi.fn(), patch: vi.fn(), del: vi.fn(),
};
const idleStart = new Date("2026-09-15T09:00:00Z");

beforeEach(() => vi.resetAllMocks());

describe("stop at an idle boundary", () => {
  it("records the idle boundary without a second stop request", async () => {
    await stopTimerAtIdleBoundary(client, 42, idleStart, true);
    expect(updateTimesheet).toHaveBeenCalledWith(client, 42, { end: toKimaiLocal(idleStart) });
    expect(stopTimesheet).not.toHaveBeenCalled();
  });

  it("falls back on the same connection and timesheet when the boundary update fails", async () => {
    vi.mocked(updateTimesheet).mockRejectedValue(new Error("update failed"));
    await stopTimerAtIdleBoundary(client, 42, idleStart, true);
    expect(stopTimesheet).toHaveBeenCalledWith(client, 42);
  });

  it("propagates failures when fallback is disabled or also fails", async () => {
    const updateError = new Error("update failed");
    vi.mocked(updateTimesheet).mockRejectedValue(updateError);
    await expect(stopTimerAtIdleBoundary(client, 42, idleStart)).rejects.toBe(updateError);
    expect(stopTimesheet).not.toHaveBeenCalled();

    const stopError = new Error("stop failed");
    vi.mocked(stopTimesheet).mockRejectedValue(stopError);
    await expect(stopTimerAtIdleBoundary(client, 42, idleStart, true)).rejects.toBe(stopError);
  });
});
