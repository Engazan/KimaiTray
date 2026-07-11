import { describe, expect, it } from "vitest";
import type { KimaiTimesheetEntry } from "../api/kimaiTypes";
import { getRecordedDurationSeconds } from "./timesheetDuration";

function entry(
  duration: number | null,
  end: string | null = "2026-07-11T11:30:00+0200",
): KimaiTimesheetEntry {
  return {
    id: 1,
    begin: "2026-07-11T09:00:00+0200",
    end,
    duration,
    description: "",
    rate: 0,
    internalRate: 0,
    exported: false,
    billable: true,
    tags: [],
    activity: 2,
    project: 1,
    user: 1,
  };
}

describe("recorded timesheet duration", () => {
  it("prefers the duration calculated by Kimai", () => {
    expect(getRecordedDurationSeconds(entry(1234))).toBe(1234);
  });

  it("falls back to the recorded begin and end timestamps", () => {
    expect(getRecordedDurationSeconds(entry(null))).toBe(9_000);
  });

  it("rejects active and malformed ranges", () => {
    expect(getRecordedDurationSeconds(entry(null, null))).toBeNull();
    expect(
      getRecordedDurationSeconds(entry(null, "2026-07-11T08:00:00+0200")),
    ).toBeNull();
  });
});
