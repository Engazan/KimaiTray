import { describe, expect, it } from "vitest";
import type { TodayEntry } from "../types";
import { computeTodayGaps } from "./todayGaps";

function entry(id: number, begin: string, end: string | null): TodayEntry {
  return {
    id, projectId: 1, activityId: 1, project: "P", projectColor: "", activityColor: "",
    customerColor: "", customer: "", activity: "A", description: "", tags: [], billable: false,
    beginIso: `2026-09-23T${begin}:00`, endIso: end ? `2026-09-23T${end}:00` : null,
    duration: null, isRunning: end === null,
  };
}

const now = new Date("2026-09-23T15:00:00").getTime();

describe("computeTodayGaps", () => {
  it("finds gaps between entries regardless of display order", () => {
    const entries = [entry(3, "13:00", "14:00"), entry(2, "10:30", "12:00"), entry(1, "09:00", "10:00")];

    expect(computeTodayGaps(entries, { nowMs: now })).toEqual([
      { beforeEntryId: 2, beginIso: "2026-09-23T10:00:00", seconds: 1800 },
      { beforeEntryId: 3, beginIso: "2026-09-23T12:00:00", seconds: 3600 },
    ]);
    expect(computeTodayGaps([...entries].reverse(), { nowMs: now })).toHaveLength(2);
  });

  it("ignores short gaps, overlaps and time outside the tracked span", () => {
    const entries = [
      entry(1, "09:00", "11:00"),
      entry(2, "09:30", "10:00"),
      entry(3, "11:03", "12:00"),
    ];

    expect(computeTodayGaps(entries, { nowMs: now })).toEqual([]);
    expect(computeTodayGaps(entries, { nowMs: now, minGapMinutes: 1 })).toEqual([
      { beforeEntryId: 3, beginIso: "2026-09-23T11:00:00", seconds: 180 },
    ]);
    expect(computeTodayGaps([], { nowMs: now })).toEqual([]);
  });

  it("treats a running entry as ending now", () => {
    const entries = [entry(1, "09:00", "10:00"), entry(2, "11:00", null)];

    expect(computeTodayGaps(entries, { nowMs: now })).toEqual([
      { beforeEntryId: 2, beginIso: "2026-09-23T10:00:00", seconds: 3600 },
    ]);
    expect(computeTodayGaps([entry(2, "09:00", null), entry(3, "10:00", "10:30")], { nowMs: now })).toEqual([]);
    expect(computeTodayGaps(entries)).toHaveLength(1);
  });
});
