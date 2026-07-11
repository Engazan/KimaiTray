import type { KimaiTimesheetEntry } from "../api/kimaiTypes";
import { parseKimaiDate } from "./time";

export function getRecordedDurationSeconds(
  entry: KimaiTimesheetEntry,
): number | null {
  if (
    entry.duration !== null &&
    Number.isFinite(entry.duration) &&
    entry.duration >= 0
  ) {
    return Math.floor(entry.duration);
  }
  if (!entry.end) return null;

  const begin = parseKimaiDate(entry.begin).getTime();
  const end = parseKimaiDate(entry.end).getTime();
  if (!Number.isFinite(begin) || !Number.isFinite(end) || end < begin) {
    return null;
  }
  return Math.floor((end - begin) / 1000);
}
