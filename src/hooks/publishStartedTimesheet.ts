import type { QueryClient } from "@tanstack/react-query";
import { extractId, type KimaiTimesheetEntry } from "../api/kimaiTypes";
import { differenceInLocalCalendarDays, parseKimaiDate } from "../utils/time";

/** Recent entries as Kimai lists them once `started` exists: it keeps only the
 * newest entry per project and activity, so `started` replaces that pair. */
export function withRecentEntry(
  previous: KimaiTimesheetEntry[] | undefined,
  started: KimaiTimesheetEntry,
): KimaiTimesheetEntry[] | undefined {
  if (!previous) return previous;
  const project = extractId(started.project);
  const activity = extractId(started.activity);
  return [
    started,
    ...previous.filter(
      (entry) =>
        entry.id !== started.id &&
        (extractId(entry.project) !== project || extractId(entry.activity) !== activity),
    ),
  ];
}

/** Today's entries including `started` when it begins today. */
export function withTodayEntry(
  previous: KimaiTimesheetEntry[] | undefined,
  started: KimaiTimesheetEntry,
  now = new Date(),
): KimaiTimesheetEntry[] | undefined {
  if (!previous || previous.some((entry) => entry.id === started.id)) return previous;
  if (differenceInLocalCalendarDays(now, parseKimaiDate(started.begin)) !== 0) return previous;
  return [started, ...previous];
}

/**
 * Show a newly started timesheet in Recent and Today right away, the way the
 * server will return it. Without this both lists change only when their
 * refetch lands a moment after the active card, so rows jump a second time.
 */
export function publishStartedTimesheet(
  qc: QueryClient,
  cacheScope: string,
  started: KimaiTimesheetEntry,
) {
  qc.setQueryData<KimaiTimesheetEntry[]>(
    ["recent-timesheets", cacheScope],
    (previous) => withRecentEntry(previous, started),
  );
  qc.setQueryData<KimaiTimesheetEntry[]>(
    ["today-timesheets", cacheScope],
    (previous) => withTodayEntry(previous, started),
  );
}
