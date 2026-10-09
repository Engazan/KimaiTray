import { beforeEach, describe, expect, it, vi } from "vitest";
import type { KimaiClient } from "../api/kimaiClient";
import { KimaiApiError } from "../api/kimaiClient";
import type { KimaiTimesheetEntry } from "../api/kimaiTypes";
import {
  getActiveTimesheets,
  restartTimesheet,
  startTimesheet,
  stopTimesheet,
  updateTimesheet,
} from "../api/timesheetApi";
import { toKimaiLocal } from "../utils/time";
import {
  entriesToStop,
  stopTimerAtIdleBoundary,
  switchTask,
  TaskSwitchError,
} from "./timerService";

vi.mock("../api/timesheetApi", () => ({
  getActiveTimesheets: vi.fn(),
  restartTimesheet: vi.fn(),
  startTimesheet: vi.fn(),
  stopTimesheet: vi.fn(),
  updateTimesheet: vi.fn(),
  updateTimesheetMeta: vi.fn(),
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

function running(id: number, begin: string): KimaiTimesheetEntry {
  return { id, begin, end: null, project: 1, activity: 2 } as KimaiTimesheetEntry;
}

const payload = { projectId: 3, activityId: 4, label: "New" };

describe("switching under an active entries limit", () => {
  const oldest = running(1, "2026-09-15T08:00:00+0000");
  const middle = running(2, "2026-09-15T09:00:00+0000");
  const newest = running(3, "2026-09-15T10:00:00+0000");

  it("picks the oldest entries beyond the room left for one more", () => {
    expect(entriesToStop([newest, oldest, middle], 1)).toEqual([oldest, middle, newest]);
    expect(entriesToStop([newest, oldest, middle], 3)).toEqual([oldest]);
    expect(entriesToStop([newest, middle], 3)).toEqual([]);
    expect(entriesToStop([newest], 0)).toEqual([newest]);
  });

  it("keeps running timers that still fit the limit", async () => {
    vi.mocked(getActiveTimesheets).mockResolvedValue([newest, oldest]);
    vi.mocked(startTimesheet).mockResolvedValue(running(4, "2026-09-15T11:00:00+0000"));

    const entry = await switchTask(client, payload, { activeLimit: 3 });

    expect(entry.id).toBe(4);
    expect(stopTimesheet).not.toHaveBeenCalled();
  });

  it("stops only the oldest timer when the limit is reached", async () => {
    vi.mocked(getActiveTimesheets).mockResolvedValue([newest, oldest]);
    vi.mocked(startTimesheet).mockResolvedValue(running(4, "2026-09-15T11:00:00+0000"));

    await switchTask(client, payload, { activeLimit: 2 });

    expect(stopTimesheet).toHaveBeenCalledOnce();
    expect(stopTimesheet).toHaveBeenCalledWith(client, oldest.id);
  });

  it("stops every running timer without a limit", async () => {
    vi.mocked(getActiveTimesheets).mockResolvedValue([newest, oldest]);
    vi.mocked(startTimesheet).mockResolvedValue(running(4, "2026-09-15T11:00:00+0000"));

    await switchTask(client, payload);

    expect(stopTimesheet).toHaveBeenCalledTimes(2);
  });

  it("rolls back a stopped timer while kept timers stay running", async () => {
    vi.mocked(getActiveTimesheets)
      .mockResolvedValueOnce([newest, oldest])
      .mockResolvedValueOnce([newest]);
    vi.mocked(startTimesheet).mockRejectedValue(
      KimaiApiError.fromResponse(422, "Unprocessable Entity", { message: "rejected" }),
    );

    const error = await switchTask(client, payload, { activeLimit: 2 }).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(TaskSwitchError);
    expect((error as TaskSwitchError).recoveryBlocked).toBe(false);
    expect(restartTimesheet).toHaveBeenCalledWith(client, oldest.id);
  });

  it("blocks the rollback when an unknown timer appeared after a rejected start", async () => {
    vi.mocked(getActiveTimesheets)
      .mockResolvedValueOnce([newest, oldest])
      .mockResolvedValueOnce([newest, running(9, "2026-09-15T11:00:00+0000")]);
    vi.mocked(startTimesheet).mockRejectedValue(
      KimaiApiError.fromResponse(422, "Unprocessable Entity", { message: "rejected" }),
    );

    const error = await switchTask(client, payload, { activeLimit: 2 }).catch((e: unknown) => e);

    expect((error as TaskSwitchError).recoveryBlocked).toBe(true);
    expect(restartTimesheet).not.toHaveBeenCalled();
  });
});
