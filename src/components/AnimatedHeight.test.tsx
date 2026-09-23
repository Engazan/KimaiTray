// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import AnimatedHeight from "./AnimatedHeight";
import { markUserIntent, resetUserIntent } from "../utils/userIntent";

let onResize = () => {};
const disconnect = vi.fn();
let contentHeight = 40;
let outerHeight = 40;

beforeEach(() => {
  vi.useFakeTimers();
  markUserIntent();
  disconnect.mockClear();
  contentHeight = 40;
  outerHeight = 40;
  vi.stubGlobal("ResizeObserver", class {
    constructor(callback: () => void) { onResize = callback; }
    observe() {}
    disconnect = disconnect;
  });
  vi.spyOn(HTMLElement.prototype, "offsetHeight", "get").mockImplementation(() => contentHeight);
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(
    () => ({ height: outerHeight }) as DOMRect,
  );
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function renderWrapper() {
  const result = render(<AnimatedHeight className="extra"><p>content</p></AnimatedHeight>);
  const inner = screen.getByText("content").parentElement!;
  return { ...result, outer: inner.parentElement!, inner };
}

describe("AnimatedHeight", () => {
  it("keeps its natural height at rest and contains child margins", () => {
    const { outer, inner } = renderWrapper();
    expect(outer.style.height).toBe("");
    expect(outer.style.overflow).toBe("");
    expect(outer.className).toContain("extra");
    expect(inner.className).toContain("flow-root");
  });

  it("animates between heights and returns to auto after the transition", () => {
    const { outer } = renderWrapper();

    contentHeight = 96;
    onResize();
    expect(outer.style.height).toBe("96px");
    expect(outer.style.overflow).toBe("hidden");

    fireEvent.transitionEnd(outer, { propertyName: "opacity" });
    expect(outer.style.height).toBe("96px");
    fireEvent.transitionEnd(outer, { propertyName: "height" });
    expect(outer.style.height).toBe("");
    expect(outer.style.overflow).toBe("");
  });

  it("continues from the current height when interrupted and settles by timeout", () => {
    const { outer } = renderWrapper();

    contentHeight = 96;
    onResize();
    outerHeight = 70;
    contentHeight = 120;
    onResize();
    expect(outer.style.height).toBe("120px");

    vi.advanceTimersByTime(400);
    expect(outer.style.height).toBe("");
  });

  it("jumps without animating when no user interaction caused the change", () => {
    const { outer } = renderWrapper();
    resetUserIntent();
    contentHeight = 96;
    onResize();
    expect(outer.style.height).toBe("");
    expect(outer.style.overflow).toBe("");
  });

  it("ignores resizes that do not change the height and cleans up on unmount", () => {
    const { outer, unmount } = renderWrapper();
    onResize();
    expect(outer.style.height).toBe("");

    unmount();
    expect(disconnect).toHaveBeenCalledOnce();
  });
});
