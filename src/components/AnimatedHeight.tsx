import { useLayoutEffect, useRef, type ReactNode } from "react";

interface AnimatedHeightProps {
  children: ReactNode;
  className?: string;
}

/**
 * Smoothly follows the height of its content instead of jumping when the
 * content grows or shrinks (e.g. the timer card appearing or changing shape).
 */
export default function AnimatedHeight({ children, className = "" }: AnimatedHeightProps) {
  const outerRef = useRef<HTMLDivElement>(null);
  const innerRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const outer = outerRef.current!;
    const inner = innerRef.current!;
    const sync = () => {
      outer.style.height = `${inner.offsetHeight}px`;
    };
    sync();
    const observer = new ResizeObserver(sync);
    observer.observe(inner);
    return () => observer.disconnect();
  }, []);

  return (
    <div
      ref={outerRef}
      className={`overflow-hidden transition-[height] duration-200 ease-out ${className}`}
    >
      <div ref={innerRef}>{children}</div>
    </div>
  );
}
