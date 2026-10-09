import { useLayoutEffect, useRef, type RefObject } from "react";
import { hasRecentUserIntent } from "../utils/userIntent";

const MOVE_OPTIONS: KeyframeAnimationOptions = {
  duration: 220,
  easing: "cubic-bezier(0.22, 1, 0.36, 1)",
};
const ENTER_OPTIONS: KeyframeAnimationOptions = { duration: 180, easing: "ease-out" };

/** Vertical offset an in-flight animation currently adds to `item`. */
function animatedOffsetY(item: HTMLElement): number {
  const transform = getComputedStyle(item).transform;
  const values = /^matrix(3d)?\((.+)\)$/.exec(transform ?? "");
  if (!values) return 0;
  const numbers = values[2].split(",").map(Number);
  return (values[1] ? numbers[13] : numbers[5]) || 0;
}

function prefersReducedMotion(): boolean {
  return (
    document.documentElement.dataset.reduceMotion === "true" ||
    window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true
  );
}

/**
 * FLIP animation for rows inside a container: after every render, elements
 * marked with `data-flip-key` glide from their previous position to the new
 * one, and newly added keys fade in. Positions are measured relative to the
 * container so rows in different sections move together. Only changes that
 * follow recent user interaction animate, so loading data does not shuffle.
 *
 * Layout positions exclude any running animation's offset. Otherwise a render
 * during an animation (e.g. a ticking timer) records a mid-flight position and
 * the next render "corrects" towards it, making rows jump back and forth.
 */
export function useFlipAnimation(containerRef: RefObject<HTMLElement | null>) {
  const previous = useRef<Map<string, number> | null>(null);

  useLayoutEffect(() => {
    const container = containerRef.current;
    if (!container) {
      previous.current = null;
      return;
    }
    const origin = container.getBoundingClientRect().top - container.scrollTop;
    const items = container.querySelectorAll<HTMLElement>("[data-flip-key]");
    const before = previous.current;
    const animate = before !== null && hasRecentUserIntent() && !prefersReducedMotion();
    const next = new Map<string, number>();

    items.forEach((item) => {
      const key = item.dataset.flipKey!;
      const offset = animatedOffsetY(item);
      const top = item.getBoundingClientRect().top - offset - origin;
      next.set(key, top);
      if (!animate) return;
      const oldTop = before.get(key);
      if (oldTop === undefined) {
        item.animate?.(
          [{ opacity: 0, transform: "translateY(-4px)" }, { opacity: 1, transform: "none" }],
          ENTER_OPTIONS,
        );
      } else if (Math.abs(oldTop - top) >= 1) {
        // Continue from where the row is drawn now, including any glide that
        // is still running, instead of restarting from its old layout slot.
        item.getAnimations?.().forEach((running) => running.cancel());
        item.animate?.(
          [{ transform: `translateY(${oldTop + offset - top}px)` }, { transform: "none" }],
          MOVE_OPTIONS,
        );
      }
    });
    previous.current = next;
  });
}
