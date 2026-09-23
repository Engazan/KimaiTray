// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import AnimatedHeight from "./AnimatedHeight";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("AnimatedHeight", () => {
  it("follows the content height and stops observing on unmount", () => {
    let onResize = () => {};
    const disconnect = vi.fn();
    vi.stubGlobal("ResizeObserver", class {
      constructor(callback: () => void) { onResize = callback; }
      observe() {}
      disconnect = disconnect;
    });
    const height = vi.spyOn(HTMLElement.prototype, "offsetHeight", "get").mockReturnValue(40);

    const { unmount } = render(<AnimatedHeight className="extra"><p>content</p></AnimatedHeight>);
    const outer = screen.getByText("content").parentElement!.parentElement!;
    expect(outer.style.height).toBe("40px");
    expect(outer.className).toContain("extra");
    expect(screen.getByText("content").parentElement!.className).toContain("flow-root");

    height.mockReturnValue(96);
    onResize();
    expect(outer.style.height).toBe("96px");

    unmount();
    expect(disconnect).toHaveBeenCalledOnce();
    height.mockRestore();
  });
});
