import { describe, expect, it } from "vitest";
import { normalizeCustomStartTime } from "./customStartTime";

describe("custom timer start time", () => {
  it("converts a valid local datetime to a Kimai local-wall-clock timestamp", () => {
    // Kimai ignores any timezone offset and stamps the sent wall-clock digits
    // with the user's timezone, so the value must be local HTML5 (no "Z"/offset)
    // — sending UTC via toISOString() would shift the record by the UTC offset.
    const value = "2026-07-11T09:30";

    expect(
      normalizeCustomStartTime(value, new Date("2026-07-11T12:00").getTime()),
    ).toBe("2026-07-11T09:30:00");
  });

  it("rejects empty, malformed and future values", () => {
    const now = new Date("2026-07-11T12:00").getTime();

    expect(normalizeCustomStartTime("", now)).toBeNull();
    expect(normalizeCustomStartTime("invalid", now)).toBeNull();
    expect(normalizeCustomStartTime("2026-07-11T12:01", now)).toBeNull();
  });
});
