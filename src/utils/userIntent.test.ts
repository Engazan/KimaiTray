// @vitest-environment jsdom

import { afterEach, describe, expect, it } from "vitest";
import {
  USER_INTENT_WINDOW_MS,
  hasRecentUserIntent,
  installUserIntentTracking,
  markUserIntent,
  resetUserIntent,
} from "./userIntent";

afterEach(() => resetUserIntent());

describe("user intent tracking", () => {
  it("reports intent only within the window after an interaction", () => {
    expect(hasRecentUserIntent(0)).toBe(false);
    markUserIntent(1000);
    expect(hasRecentUserIntent(1000 + USER_INTENT_WINDOW_MS)).toBe(true);
    expect(hasRecentUserIntent(1001 + USER_INTENT_WINDOW_MS)).toBe(false);
    markUserIntent();
    expect(hasRecentUserIntent()).toBe(true);
  });

  it("marks intent from pointer and key events until uninstalled", () => {
    const uninstall = installUserIntentTracking();
    document.dispatchEvent(new Event("pointerdown"));
    expect(hasRecentUserIntent()).toBe(true);

    resetUserIntent();
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "a" }));
    expect(hasRecentUserIntent()).toBe(true);

    resetUserIntent();
    uninstall();
    document.dispatchEvent(new Event("pointerdown"));
    expect(hasRecentUserIntent()).toBe(false);
  });
});
