import { describe, expect, it } from "vitest";
import type { ColorMode } from "../types";
import { resolveDisplayColors, resolveEntityColors } from "./colorMode";

describe("timer display color modes", () => {
  const colors = ["#activity", "#project", "#customer"] as const;

  it.each<[ColorMode, string[]]>([
    ["activity", ["#activity"]],
    ["project", ["#project"]],
    ["customer", ["#customer"]],
    ["activity-project", ["#activity", "#project"]],
    ["activity-customer", ["#activity", "#customer"]],
    ["project-customer", ["#project", "#customer"]],
    ["kimai", ["#activity"]],
  ])("resolves %s in display order", (mode, expected) => {
    expect(resolveDisplayColors(...colors, mode)).toEqual(expected);
  });

  it("uses the first available Kimai color", () => {
    expect(resolveDisplayColors("", "#project", "#customer", "kimai")).toEqual([
      "#project",
    ]);
    expect(resolveDisplayColors("", "", "#customer", "kimai")).toEqual([
      "#customer",
    ]);
  });

  it("uses a neutral fallback independently for missing split colors", () => {
    expect(resolveDisplayColors("", "", "", "activity-project")).toEqual([
      "#6b7280",
      "#6b7280",
    ]);
    expect(resolveDisplayColors("", "", "", "kimai")).toEqual(["#6b7280"]);
  });

  it("treats an unknown runtime value like Kimai mode", () => {
    expect(
      resolveDisplayColors("#activity", "#project", "#customer", "future" as ColorMode),
    ).toEqual(["#activity"]);
  });
});

describe("resolveEntityColors", () => {
  it("keeps explicit colors so the Kimai cascade is preserved", () => {
    expect(
      resolveEntityColors(
        { color: "#111111", "color-safe": "#111111" },
        { color: null, "color-safe": "#222222" },
        undefined,
      ),
    ).toEqual({ projectColor: "#111111", activityColor: "", customerColor: "" });
  });

  it("falls back to Kimai's color-safe values when no color is configured", () => {
    expect(
      resolveEntityColors(
        { color: null, "color-safe": "#333333" },
        { color: null, "color-safe": "#444444" },
        { color: null },
      ),
    ).toEqual({ projectColor: "#333333", activityColor: "#444444", customerColor: "" });
    expect(resolveEntityColors(undefined, undefined, undefined)).toEqual({
      projectColor: "", activityColor: "", customerColor: "",
    });
  });
});
