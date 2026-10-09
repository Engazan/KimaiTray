// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render } from "@testing-library/react";
import { useRef } from "react";
import { useFlipAnimation } from "./useFlipAnimation";
import { markUserIntent, resetUserIntent } from "../utils/userIntent";

const tops = new Map<string, number>();
const transforms = new Map<string, string>();
const animate = vi.fn();
const cancel = vi.fn();

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
  markUserIntent();
  tops.clear();
  transforms.clear();
  animate.mockClear();
  cancel.mockClear();
  vi.spyOn(window, "getComputedStyle").mockImplementation((element) => ({
    transform: transforms.get((element as HTMLElement).dataset.flipKey ?? "") ?? "none",
  }) as CSSStyleDeclaration);
  (HTMLElement.prototype as unknown as { getAnimations: () => unknown[] }).getAnimations = () => [{ cancel }];
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

  it("does not animate changes that no user interaction caused", () => {
    layout({ a: 0 });
    const { rerender } = render(<List keys={["a"]} />);
    resetUserIntent();
    layout({ a: 40, b: 0 });
    rerender(<List keys={["b", "a"]} />);
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

  it("ignores a running glide's offset when recording where rows sit", () => {
    layout({ a: 0, b: 30 });
    const { rerender } = render(<List keys={["a", "b"]} />);

    // A re-render while b is drawn 20px below its slot: nothing actually moved.
    layout({ a: 0, b: 50 });
    transforms.set("b", "matrix(1, 0, 0, 1, 0, 20)");
    rerender(<List keys={["a", "b"]} />);
    expect(animate).not.toHaveBeenCalled();

    transforms.clear();
    layout({ a: 0, b: 30 });
    rerender(<List keys={["a", "b"]} />);
    expect(animate).not.toHaveBeenCalled();
  });

  it("continues an interrupted glide from where the row is drawn", () => {
    layout({ a: 0, b: 60 });
    const { rerender } = render(<List keys={["a", "b"]} />);

    // b moves up to 30 while still drawn 12px off by a running 3D transform.
    layout({ a: 0, b: 42 });
    transforms.set("b", "matrix3d(1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 12, 0, 1)");
    rerender(<List keys={["a", "b"]} />);

    expect(cancel).toHaveBeenCalledOnce();
    expect(animate).toHaveBeenCalledWith(
      [{ transform: "translateY(42px)" }, { transform: "none" }],
      expect.objectContaining({ duration: 220 }),
    );
  });
});
