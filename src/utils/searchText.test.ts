import { describe, expect, it } from "vitest";
import { normalizeSearchText, normalizeTextKey } from "./searchText";

describe("normalizeSearchText", () => {
  it("matches precomposed and decomposed Unicode input", () => {
    expect(normalizeSearchText("for\u00eat")).toBe(
      normalizeSearchText("fore\u0302t"),
    );
    expect(normalizeTextKey("for\u00eat")).toBe(
      normalizeTextKey("fore\u0302t"),
    );
  });

  it("supports case- and diacritic-insensitive search", () => {
    expect(normalizeSearchText("ŽLTÝ KÔŇ")).toBe("zlty kon");
  });

  it("removes combining marks outside the Latin combining block", () => {
    expect(normalizeSearchText("שָׁלוֹם")).toBe(normalizeSearchText("שלום"));
  });

  it("preserves diacritics in identity keys", () => {
    expect(normalizeTextKey("resume")).not.toBe(normalizeTextKey("résumé"));
  });
});
