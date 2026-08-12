import { describe, expect, it } from "vitest";
import {
  normalizeKimaiTags,
  sanitizeTagInput,
  serializeKimaiTags,
} from "./tagUtils";

describe("Kimai tag normalization", () => {
  it("normalizes comma-separated strings and preserves first spelling", () => {
    expect(normalizeKimaiTags(" Support,urgent, support , ,URGENT ")).toEqual([
      "Support",
      "urgent",
    ]);
  });

  it("accepts arrays of strings and Kimai tag objects", () => {
    expect(normalizeKimaiTags([" alpha ", "beta"])).toEqual(["alpha", "beta"]);
    expect(normalizeKimaiTags([{ name: "alpha" }, { name: " beta " }])).toEqual([
      "alpha",
      "beta",
    ]);
  });

  it("returns an empty list for nullish or unsupported input", () => {
    expect(normalizeKimaiTags(null)).toEqual([]);
    expect(normalizeKimaiTags(undefined)).toEqual([]);
    expect(normalizeKimaiTags(42 as never)).toEqual([]);
  });

  it("sanitizes user input through the same rules", () => {
    expect(sanitizeTagInput("one, ONE, two")).toEqual(["one", "two"]);
  });

  it("serializes normalized tag lists for Kimai payloads", () => {
    expect(serializeKimaiTags(["one", "two"])).toBe("one,two");
    expect(serializeKimaiTags([])).toBe("");
  });
});
