// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest";
import { resolveLanguage, resolveSystemLanguage } from "./index";

afterEach(() => vi.restoreAllMocks());

describe("language resolution", () => {
  it.each([
    ["sk-SK", "sk"],
    ["cs-CZ", "cs"],
    ["cz", "cs"],
    ["de-DE", "de"],
    ["uk-UA", "uk"],
    ["ua", "uk"],
    ["en-US", "en"],
    ["es-ES", "es"],
    ["es-MX", "es"],
    ["es-AR", "es"],
    ["fr-FR", "en"],
  ] as const)("maps %s to %s", (browserLanguage, expected) => {
    vi.spyOn(navigator, "language", "get").mockReturnValue(browserLanguage);
    expect(resolveSystemLanguage()).toBe(expected);
    expect(resolveLanguage("system")).toBe(expected);
  });

  it("keeps an explicit supported language", () => {
    expect(resolveLanguage("de")).toBe("de");
    expect(resolveLanguage("es")).toBe("es");
  });
});
