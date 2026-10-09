import { QueryClient } from "@tanstack/react-query";
import { describe, expect, it } from "vitest";
import type { KimaiTimesheetEntry } from "../api/kimaiTypes";
import {
  publishStartedTimesheet,
  withRecentEntry,
  withTodayEntry,
} from "./publishStartedTimesheet";

function entry(id: number, project: number, activity: number, begin: string): KimaiTimesheetEntry {
  return { id, project, activity, begin, end: null, description: null } as unknown as KimaiTimesheetEntry;
}

const now = new Date(2026, 9, 9, 12, 0);
const todayBegin = "2026-10-09T11:00:00";
const started = entry(9, 1, 1, todayBegin);

describe("publishing a started timesheet", () => {
  it("replaces the recent entry for the same project and activity", () => {
    const sameNoteless = entry(1, 1, 1, "2026-10-08T08:00:00");
    const otherActivity = entry(2, 1, 2, "2026-10-08T09:00:00");

    expect(withRecentEntry([otherActivity, sameNoteless], started)).toEqual([started, otherActivity]);
    expect(withRecentEntry([started, otherActivity], started)).toEqual([started, otherActivity]);
    expect(withRecentEntry(undefined, started)).toBeUndefined();
  });

  it("adds a timer that began today to today's entries once", () => {
    const earlier = entry(3, 2, 2, "2026-10-09T08:00:00");

    expect(withTodayEntry([earlier], started, now)).toEqual([started, earlier]);
    expect(withTodayEntry([started, earlier], started, now)).toEqual([started, earlier]);
    expect(withTodayEntry([earlier], entry(9, 1, 1, "2026-10-08T23:00:00"), now)).toEqual([earlier]);
    expect(withTodayEntry(undefined, started, now)).toBeUndefined();
  });

  it("updates only lists already loaded for the connection", () => {
    const qc = new QueryClient();
    qc.setQueryData(["recent-timesheets", "c:1"], [entry(1, 1, 1, "2026-10-08T08:00:00")]);

    publishStartedTimesheet(qc, "c:1", { ...started, begin: new Date().toISOString() });

    expect(qc.getQueryData<KimaiTimesheetEntry[]>(["recent-timesheets", "c:1"])?.map((e) => e.id)).toEqual([9]);
    expect(qc.getQueryData(["today-timesheets", "c:1"])).toBeUndefined();
    expect(qc.getQueryData(["recent-timesheets", "c:2"])).toBeUndefined();
  });
});
