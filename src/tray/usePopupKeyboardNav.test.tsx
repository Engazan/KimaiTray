// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useRef } from "react";
import { focusNavItem, usePopupKeyboardNav } from "./usePopupKeyboardNav";

afterEach(() => cleanup());

function Harness({ enabled = true, filter = true }: { enabled?: boolean; filter?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  const handlers = Harness.handlers;
  usePopupKeyboardNav({
    enabled,
    containerRef: ref,
    onFilterStart: filter ? handlers.onFilterStart : undefined,
    onStartFavorite: handlers.onStartFavorite,
    onPauseResume: handlers.onPauseResume,
    onNewTask: handlers.onNewTask,
  });
  return (
    <div>
      <input aria-label="field" />
      <div role="dialog"><button type="button">in-dialog</button></div>
      <div ref={ref}>
        <button type="button" data-nav-item>one</button>
        <button type="button" data-nav-item disabled>skipped</button>
        <button type="button" data-nav-item>two</button>
        <span tabIndex={-1}>plain</span>
      </div>
    </div>
  );
}
Harness.handlers = {
  onFilterStart: vi.fn(),
  onStartFavorite: vi.fn(),
  onPauseResume: vi.fn(),
  onNewTask: vi.fn(),
};

describe("usePopupKeyboardNav", () => {
  it("moves focus between enabled rows with the arrow keys", () => {
    render(<Harness />);
    const one = screen.getByRole("button", { name: "one" });
    const two = screen.getByRole("button", { name: "two" });

    fireEvent.keyDown(document.body, { key: "ArrowDown" });
    expect(document.activeElement).toBe(one);
    fireEvent.keyDown(one, { key: "ArrowDown" });
    expect(document.activeElement).toBe(two);
    fireEvent.keyDown(two, { key: "ArrowDown" });
    expect(document.activeElement).toBe(two);
    fireEvent.keyDown(two, { key: "ArrowUp" });
    expect(document.activeElement).toBe(one);

    one.blur();
    fireEvent.keyDown(document.body, { key: "ArrowUp" });
    expect(document.activeElement).toBe(two);
  });

  it("runs shortcuts and opens the filter from typing", () => {
    const h = Harness.handlers;
    render(<Harness />);

    fireEvent.keyDown(document.body, { key: "2", metaKey: true });
    expect(h.onStartFavorite).toHaveBeenCalledWith(1);
    fireEvent.keyDown(document.body, { key: "N", ctrlKey: true });
    expect(h.onNewTask).toHaveBeenCalledOnce();
    fireEvent.keyDown(document.body, { key: " " });
    expect(h.onPauseResume).toHaveBeenCalledOnce();
    fireEvent.keyDown(document.body, { key: "a" });
    expect(h.onFilterStart).toHaveBeenCalledWith("a");
  });

  it("leaves keys alone in editable fields, dialogs, on buttons and when disabled", () => {
    const h = Harness.handlers;
    vi.clearAllMocks();
    const { rerender } = render(<Harness />);

    fireEvent.keyDown(screen.getByLabelText("field"), { key: "a" });
    fireEvent.keyDown(screen.getByRole("button", { name: "in-dialog" }), { key: "a" });
    const one = screen.getByRole("button", { name: "one" });
    one.focus();
    fireEvent.keyDown(one, { key: " " });
    fireEvent.keyDown(document.body, { key: "Shift" });
    fireEvent.keyDown(document.body, { key: "x", altKey: true });
    fireEvent.keyDown(document.body, { key: "a", isComposing: true });
    expect(h.onFilterStart).not.toHaveBeenCalled();
    expect(h.onPauseResume).not.toHaveBeenCalled();

    rerender(<Harness filter={false} />);
    one.blur();
    fireEvent.keyDown(document.body, { key: "a" });
    expect(h.onFilterStart).not.toHaveBeenCalled();

    rerender(<Harness enabled={false} />);
    fireEvent.keyDown(document.body, { key: "1", metaKey: true });
    expect(h.onStartFavorite).not.toHaveBeenCalled();
  });

  it("reports whether a row could be focused", () => {
    expect(focusNavItem(null, "first")).toBe(false);
    expect(focusNavItem(document.createElement("div"), 1)).toBe(false);
    const box = document.createElement("div");
    box.innerHTML = "<button data-nav-item>row</button>";
    document.body.append(box);
    expect(focusNavItem(box, "first")).toBe(true);
    expect(document.activeElement?.textContent).toBe("row");
    box.remove();
  });
});
