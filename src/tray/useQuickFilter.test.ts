// @vitest-environment jsdom

import { describe, expect, it } from "vitest";
import { act, renderHook } from "@testing-library/react";
import type { FavoriteTask, RecentTask } from "../types";
import { useQuickFilter } from "./useQuickFilter";

const favorite = { key: "f", project: "Kimai Tray", activity: "Coding", customer: "ACME", description: "" } as FavoriteTask;
const recent = { key: "r", project: "Website", activity: "Design", customer: "", description: "Landing páge" } as RecentTask;

describe("useQuickFilter", () => {
  it("filters by every term across fields, ignoring case and diacritics", () => {
    const { result } = renderHook(() => useQuickFilter([favorite], [recent], "conn"));
    expect(result.current.active).toBe(false);
    expect(result.current.tasks).toEqual([recent]);

    act(() => result.current.setQuery("tray acme"));
    expect(result.current.favorites).toEqual([favorite]);
    expect(result.current.tasks).toEqual([]);

    act(() => result.current.setQuery("PAGE"));
    expect(result.current.tasks).toEqual([recent]);
    expect(result.current.isEmpty).toBe(false);

    act(() => result.current.setQuery("nothing"));
    expect(result.current.isEmpty).toBe(true);
  });

  it("resets when the reset key changes", () => {
    const { result, rerender } = renderHook(({ key }) => useQuickFilter([favorite], [recent], key), {
      initialProps: { key: "a" },
    });
    act(() => result.current.setQuery("web"));
    rerender({ key: "b" });
    expect(result.current.query).toBe("");
  });
});
