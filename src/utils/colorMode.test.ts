import { describe, expect, it } from "vitest";
import type { ColorMode } from "../types";
import { resolveDisplayColors } from "./colorMode";

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
