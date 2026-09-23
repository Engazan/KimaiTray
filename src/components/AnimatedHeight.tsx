import { useLayoutEffect, useRef, type ReactNode } from "react";
import { hasRecentUserIntent } from "../utils/userIntent";

interface AnimatedHeightProps {
  children: ReactNode;
  className?: string;
}

/** Longest a transition may keep the wrapper at a fixed, clipping height. */
const SETTLE_MS = 400;

/**
 * Smoothly follows the height of its content instead of jumping when the
 * content grows or shrinks (e.g. the timer card appearing or changing shape).
 *
 * The wrapper only has a fixed height and clips its content while a change is
 * animating; afterwards it returns to its natural height, so a missed resize
 * notification can never leave content permanently cut off.
 */
export default function AnimatedHeight({ children, className = "" }: AnimatedHeightProps) {
  const outerRef = useRef<HTMLDivElement>(null);
  const innerRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const outer = outerRef.current!;
    const inner = innerRef.current!;
    let lastHeight = inner.offsetHeight;
    let settleTimer: ReturnType<typeof setTimeout> | undefined;

    const settle = () => {
      clearTimeout(settleTimer);
      outer.style.height = "";
      outer.style.overflow = "";
    };

    const onResize = () => {
      const next = inner.offsetHeight;
      const animating = outer.style.height !== "";
      const from = animating ? outer.getBoundingClientRect().height : lastHeight;
      lastHeight = next;
      // Content that merely finished loading appears in place; only changes
      // the user caused are animated.
      if (Math.abs(from - next) < 1 || !hasRecentUserIntent()) {
        settle();
        return;
      }
      outer.style.overflow = "hidden";
      outer.style.height = `${from}px`;
      void outer.offsetHeight; // commit the start height before animating
      outer.style.height = `${next}px`;
      clearTimeout(settleTimer);
      settleTimer = setTimeout(settle, SETTLE_MS);
    };

    const onTransitionEnd = (event: TransitionEvent) => {
      if (event.target === outer && event.propertyName === "height") settle();
    };

    const observer = new ResizeObserver(onResize);
    observer.observe(inner);
    outer.addEventListener("transitionend", onTransitionEnd);
    return () => {
      observer.disconnect();
      outer.removeEventListener("transitionend", onTransitionEnd);
      settle();
    };
  }, []);

  return (
    <div
      ref={outerRef}
      className={`transition-[height] duration-200 ease-out ${className}`}
    >
      {/* flow-root keeps the children's margins inside the measured box. */}
      <div ref={innerRef} className="flow-root">{children}</div>
    </div>
  );
}
