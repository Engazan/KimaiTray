import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  differenceInLocalCalendarDays,
  getLocalDayRange,
  parseKimaiDate,
  toDateTimeLocalInput,
} from "./time";

describe("time utilities", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("normalizes Kimai timezone offsets without a colon", () => {
    expect(parseKimaiDate("2026-06-17T10:00:00+0200").toISOString()).toBe(
      "2026-06-17T08:00:00.000Z",
    );
  });

  it("converts returned Kimai timestamps to local date-time picker values", () => {
    const input = toDateTimeLocalInput("2026-07-22T10:15:30+0200");
    const parsed = parseKimaiDate("2026-07-22T10:15:30+0200");
    const pad = (value: number) => String(value).padStart(2, "0");

    expect(input).toBe(
      `${parsed.getFullYear()}-${pad(parsed.getMonth() + 1)}-${pad(parsed.getDate())}` +
        `T${pad(parsed.getHours())}:${pad(parsed.getMinutes())}`,
    );
  });

  it("returns local wall-clock boundaries without converting them to UTC", () => {
    vi.setSystemTime(new Date(2026, 6, 11, 14, 30, 0));

    expect(getLocalDayRange()).toEqual({
      begin: "2026-07-11T00:00:00",
      end: "2026-07-11T23:59:59",
    });
  });

  it("compares calendar days independently of DST-length days", () => {
    const beforeSpringShift = new Date(2025, 2, 30, 12, 0);
    const afterSpringShift = new Date(2025, 2, 31, 12, 0);

    expect(
      differenceInLocalCalendarDays(afterSpringShift, beforeSpringShift),
    ).toBe(1);
  });
});
