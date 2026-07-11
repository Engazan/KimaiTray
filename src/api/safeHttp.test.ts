import { describe, expect, it } from "vitest";
import { resolveSafeRedirect } from "./safeHttp";

describe("safe HTTP redirects", () => {
  const origin = "https://kimai.example.test";

  it("accepts relative redirects on the authenticated origin", () => {
    expect(
      resolveSafeRedirect(
        `${origin}/api/timesheets`,
        "/index.php/api/timesheets",
        origin,
      ),
    ).toBe(`${origin}/index.php/api/timesheets`);
  });

  it("blocks redirects that could leak an authorization header", () => {
    expect(() =>
      resolveSafeRedirect(
        `${origin}/api/timesheets`,
        "https://attacker.example/collect",
        origin,
      ),
    ).toThrow(/Cross-origin/);
    expect(() =>
      resolveSafeRedirect(
        `${origin}/api/timesheets`,
        "http://kimai.example.test/api/timesheets",
        origin,
      ),
    ).toThrow();
  });
});
