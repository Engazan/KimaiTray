import { describe, expect, it } from "vitest";
import { parseTimePart } from "./DateTimePicker";

describe("DateTimePicker time validation", () => {
  it("accepts valid hour and minute boundaries", () => {
    expect(parseTimePart("00", 23)).toBe(0);
    expect(parseTimePart("23", 23)).toBe(23);
    expect(parseTimePart("59", 59)).toBe(59);
  });

  it("rejects values that JavaScript Date would roll into another day", () => {
    expect(parseTimePart("24", 23)).toBeNull();
    expect(parseTimePart("99", 59)).toBeNull();
    expect(parseTimePart("", 59)).toBeNull();
  });
});
