import type { KimaiTimesheetUpdate } from "../api/kimaiTypes";
import type { TodayEntry } from "../types";
import {
  parseKimaiDate,
  toDateTimeLocalInput,
  toKimaiLocal,
} from "./time";

export type TimesheetTimeEditError = "invalid" | "endBeforeBegin";

export type TimesheetTimeEditResult =
  | { ok: true; payload: KimaiTimesheetUpdate }
  | { ok: false; error: TimesheetTimeEditError };

export function initialTimesheetTimeDraft(entry: TodayEntry): {
  begin: string;
  end: string;
} {
  return {
    begin: toDateTimeLocalInput(entry.beginIso),
    end: entry.endIso ? toDateTimeLocalInput(entry.endIso) : "",
  };
}

export function buildTimesheetTimeUpdate(
  entry: TodayEntry,
  beginValue: string,
  endValue: string,
): TimesheetTimeEditResult {
  if (!entry.endIso) return { ok: false, error: "invalid" };

  const initial = initialTimesheetTimeDraft(entry);
  const beginChanged = beginValue !== initial.begin;
  const endChanged = endValue !== initial.end;
  const editedBegin = new Date(beginValue);
  const editedEnd = new Date(endValue);

  if (
    !Number.isFinite(editedBegin.getTime()) ||
    !Number.isFinite(editedEnd.getTime())
  ) {
    return { ok: false, error: "invalid" };
  }

  const effectiveBegin = beginChanged
    ? editedBegin
    : parseKimaiDate(entry.beginIso);
  const effectiveEnd = endChanged ? editedEnd : parseKimaiDate(entry.endIso);
  if (effectiveEnd.getTime() < effectiveBegin.getTime()) {
    return { ok: false, error: "endBeforeBegin" };
  }

  return {
    ok: true,
    payload: {
      ...(beginChanged ? { begin: toKimaiLocal(editedBegin) } : {}),
      ...(endChanged ? { end: toKimaiLocal(editedEnd) } : {}),
    },
  };
}
