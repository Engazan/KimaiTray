import type { TodayEntry } from "../types";
import { parseKimaiDate } from "./time";

export interface TodayGap {
  /** Entry that starts right after the gap, in chronological order. */
  beforeEntryId: number;
  /** Kimai datetime at which the untracked period starts. */
  beginIso: string;
  seconds: number;
}

interface GapOptions {
  minGapMinutes?: number;
  nowMs?: number;
}

/**
 * Finds untracked periods between today's entries. Overlapping entries are
 * merged, and time before the first or after the last entry is not a gap.
 */
export function computeTodayGaps(
  entries: TodayEntry[],
  { minGapMinutes = 5, nowMs = Date.now() }: GapOptions = {},
): TodayGap[] {
  const chronological = entries
    .map((entry) => ({
      entry,
      beginMs: parseKimaiDate(entry.beginIso).getTime(),
      endMs:
        entry.isRunning || !entry.endIso
          ? nowMs
          : parseKimaiDate(entry.endIso).getTime(),
    }))
    .sort((a, b) => a.beginMs - b.beginMs);

  const gaps: TodayGap[] = [];
  let latestEnd: { ms: number; iso: string } | null = null;
  for (const item of chronological) {
    if (latestEnd) {
      const seconds = Math.floor((item.beginMs - latestEnd.ms) / 1000);
      if (seconds >= minGapMinutes * 60) {
        gaps.push({ beforeEntryId: item.entry.id, beginIso: latestEnd.iso, seconds });
      }
    }
    if (!latestEnd || item.endMs > latestEnd.ms) {
      latestEnd = { ms: item.endMs, iso: item.entry.endIso ?? item.entry.beginIso };
    }
  }
  return gaps;
}
