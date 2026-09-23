import { useLayoutEffect, useRef, type RefObject } from "react";

const MOVE_OPTIONS: KeyframeAnimationOptions = {
  duration: 220,
  easing: "cubic-bezier(0.22, 1, 0.36, 1)",
};
const ENTER_OPTIONS: KeyframeAnimationOptions = { duration: 180, easing: "ease-out" };

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
 * container so rows in different sections move together.
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
    const animate = before !== null && !prefersReducedMotion();
    const next = new Map<string, number>();

    items.forEach((item) => {
      const key = item.dataset.flipKey!;
      const top = item.getBoundingClientRect().top - origin;
      next.set(key, top);
      if (!animate) return;
      const oldTop = before.get(key);
      if (oldTop === undefined) {
        item.animate?.(
          [{ opacity: 0, transform: "translateY(-4px)" }, { opacity: 1, transform: "none" }],
          ENTER_OPTIONS,
        );
      } else if (Math.abs(oldTop - top) >= 1) {
        item.animate?.(
          [{ transform: `translateY(${oldTop - top}px)` }, { transform: "none" }],
          MOVE_OPTIONS,
        );
      }
    });
    previous.current = next;
  });
}
