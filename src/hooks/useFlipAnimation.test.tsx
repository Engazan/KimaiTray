// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render } from "@testing-library/react";
import { useRef } from "react";
import { useFlipAnimation } from "./useFlipAnimation";

const tops = new Map<string, number>();
const animate = vi.fn();

function List({ keys, mounted = true }: { keys: string[]; mounted?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  useFlipAnimation(ref);
  if (!mounted) return null;
  return (
    <div ref={ref}>
      {keys.map((key) => <div key={key} data-flip-key={key}>{key}</div>)}
    </div>
  );
}

beforeEach(() => {
  tops.clear();
  animate.mockClear();
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
    return { top: tops.get(this.dataset.flipKey ?? "") ?? 0 } as DOMRect;
  });
  (HTMLElement.prototype as unknown as { animate: typeof animate }).animate = animate;
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  delete document.documentElement.dataset.reduceMotion;
});

function layout(entries: Record<string, number>) {
  tops.clear();
  for (const [key, top] of Object.entries(entries)) tops.set(key, top);
}

describe("useFlipAnimation", () => {
  it("glides moved rows and fades in new ones, but not on first render", () => {
    layout({ a: 0, b: 30, c: 60 });
    const { rerender } = render(<List keys={["a", "b", "c"]} />);
    expect(animate).not.toHaveBeenCalled();

    layout({ b: 0, c: 30, d: 60 });
    rerender(<List keys={["b", "c", "d"]} />);

    expect(animate).toHaveBeenCalledWith(
      [{ transform: "translateY(30px)" }, { transform: "none" }],
      expect.objectContaining({ duration: 220 }),
    );
    expect(animate).toHaveBeenCalledWith(
      [{ opacity: 0, transform: "translateY(-4px)" }, { opacity: 1, transform: "none" }],
      expect.objectContaining({ duration: 180 }),
    );
    expect(animate).toHaveBeenCalledTimes(3);

    animate.mockClear();
    rerender(<List keys={["b", "c", "d"]} />);
    expect(animate).not.toHaveBeenCalled();
  });

  it("skips animation with reduced motion and restarts after the container unmounts", () => {
    layout({ a: 0 });
    const { rerender } = render(<List keys={["a"]} />);
    document.documentElement.dataset.reduceMotion = "true";
    layout({ a: 40 });
    rerender(<List keys={["a"]} />);
    expect(animate).not.toHaveBeenCalled();

    delete document.documentElement.dataset.reduceMotion;
    rerender(<List keys={["a"]} mounted={false} />);
    rerender(<List keys={["a"]} />);
    expect(animate).not.toHaveBeenCalled();
  });
});
