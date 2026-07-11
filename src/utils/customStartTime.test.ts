import { describe, expect, it } from "vitest";
import { normalizeCustomStartTime } from "./customStartTime";

describe("custom timer start time", () => {
  it("converts a valid local datetime to an API timestamp", () => {
    const value = "2026-07-11T09:30";
    const expected = new Date(value).toISOString();

    expect(
      normalizeCustomStartTime(value, new Date("2026-07-11T12:00").getTime()),
    ).toBe(expected);
  });

  it("rejects empty, malformed and future values", () => {
    const now = new Date("2026-07-11T12:00").getTime();

    expect(normalizeCustomStartTime("", now)).toBeNull();
    expect(normalizeCustomStartTime("invalid", now)).toBeNull();
    expect(normalizeCustomStartTime("2026-07-11T12:01", now)).toBeNull();
  });
});
