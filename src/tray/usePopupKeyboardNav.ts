import { useEffect, useRef, type RefObject } from "react";

export const NAV_ITEM_SELECTOR = "[data-nav-item]:not(:disabled)";

interface PopupKeyboardNavOptions {
  enabled: boolean;
  containerRef: RefObject<HTMLElement | null>;
  /** Called with the first typed character; omitted when filtering is unavailable. */
  onFilterStart?: (text: string) => void;
  onStartFavorite: (index: number) => void;
  onPauseResume: () => void;
  onNewTask: () => void;
}

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return (
    target.isContentEditable ||
    target.closest("input, textarea, select, [contenteditable='true']") !== null
  );
}

/** Moves focus between the popup's startable rows. */
export function focusNavItem(
  container: HTMLElement | null,
  direction: 1 | -1 | "first",
): boolean {
  if (!container) return false;
  const items = Array.from(container.querySelectorAll<HTMLElement>(NAV_ITEM_SELECTOR));
  if (items.length === 0) return false;
  const current = items.indexOf(document.activeElement as HTMLElement);
  const next =
    direction === "first" || current === -1
      ? direction === -1 ? items.length - 1 : 0
      : Math.min(items.length - 1, Math.max(0, current + direction));
  items[next].focus();
  items[next].scrollIntoView?.({ block: "nearest" });
  return true;
}

/**
 * Keyboard control for the tray popup: arrow keys move between rows, Enter
 * starts the focused row natively, Cmd/Ctrl+1–9 starts a favorite, Space
 * pauses or resumes, Cmd/Ctrl+N opens a new task and typing opens the filter.
 */
export function usePopupKeyboardNav(options: PopupKeyboardNavOptions) {
  const latest = useRef(options);
  latest.current = options;
  const { enabled } = options;

  useEffect(() => {
    if (!enabled) return;
    const onKeyDown = (event: KeyboardEvent) => {
      const opts = latest.current;
      if (event.defaultPrevented || event.isComposing) return;
      if (isEditableTarget(event.target)) return;
      if (event.target instanceof Element && event.target.closest("[role='dialog']")) return;

      const mod = event.metaKey || event.ctrlKey;
      if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        if (focusNavItem(opts.containerRef.current, event.key === "ArrowDown" ? 1 : -1)) {
          event.preventDefault();
        }
        return;
      }
      if (mod && !event.altKey && /^[1-9]$/.test(event.key)) {
        event.preventDefault();
        opts.onStartFavorite(Number(event.key) - 1);
        return;
      }
      if (mod && !event.altKey && event.key.toLowerCase() === "n") {
        event.preventDefault();
        opts.onNewTask();
        return;
      }
      if (event.key === " " && !mod) {
        // A focused button already activates on Space; only handle it when
        // nothing interactive is focused.
        const active = document.activeElement;
        if (active instanceof HTMLElement && active.closest("button, a, [role='button'], [role='tab']")) return;
        event.preventDefault();
        opts.onPauseResume();
        return;
      }
      if (
        opts.onFilterStart &&
        !mod &&
        !event.altKey &&
        event.key.length === 1 &&
        event.key.trim() !== ""
      ) {
        event.preventDefault();
        opts.onFilterStart(event.key);
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [enabled]);
}
