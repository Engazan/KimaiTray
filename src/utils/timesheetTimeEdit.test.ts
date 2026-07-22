import { describe, expect, it } from "vitest";
import type { TodayEntry } from "../types";
import {
  buildTimesheetTimeUpdate,
  initialTimesheetTimeDraft,
} from "./timesheetTimeEdit";

function entry(overrides: Partial<TodayEntry> = {}): TodayEntry {
  return {
    id: 42,
    projectId: 1,
    activityId: 2,
    project: "Forest",
    projectColor: "",
    activityColor: "",
    customerColor: "",
    customer: "Customer",
    activity: "Work",
    description: "",
    tags: [],
    billable: true,
    beginIso: "2026-07-22T09:00:30",
    endIso: "2026-07-22T10:00:45",
    duration: 3_615,
    isRunning: false,
    ...overrides,
  };
}

describe("timesheet time edit payload", () => {
  it("does not overwrite unchanged fields or their seconds", () => {
    const current = entry();
    const draft = initialTimesheetTimeDraft(current);

    expect(
      buildTimesheetTimeUpdate(current, draft.begin, "2026-07-22T11:00"),
    ).toEqual({
      ok: true,
      payload: { end: "2026-07-22T11:00:00" },
    });
  });

  it("sends begin and end together when both change", () => {
    expect(
      buildTimesheetTimeUpdate(
        entry(),
        "2026-07-22T08:30",
        "2026-07-22T10:30",
      ),
    ).toEqual({
      ok: true,
      payload: {
        begin: "2026-07-22T08:30:00",
        end: "2026-07-22T10:30:00",
      },
    });
  });

  it("rejects an end before the effective begin", () => {
    const current = entry();
    const draft = initialTimesheetTimeDraft(current);

    expect(
      buildTimesheetTimeUpdate(current, draft.begin, "2026-07-22T08:59"),
    ).toEqual({ ok: false, error: "endBeforeBegin" });
  });
});
