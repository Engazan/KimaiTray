// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import QuickFilterBar from "./QuickFilterBar";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

afterEach(() => cleanup());

function renderBar(isEmpty = false) {
  const props = { onChange: vi.fn(), onFocusResults: vi.fn(), onSubmit: vi.fn() };
  render(<QuickFilterBar query="ab" isEmpty={isEmpty} {...props} />);
  return props;
}

describe("QuickFilterBar", () => {
  it("focuses the input and handles its keyboard actions", () => {
    const props = renderBar();
    const input = screen.getByRole("searchbox", { name: "tray.filterLabel" }) as HTMLInputElement;
    expect(document.activeElement).toBe(input);
    expect(input.selectionStart).toBe(2);

    fireEvent.change(input, { target: { value: "abc" } });
    expect(props.onChange).toHaveBeenLastCalledWith("abc");
    fireEvent.keyDown(input, { key: "ArrowDown" });
    expect(props.onFocusResults).toHaveBeenCalledOnce();
    fireEvent.keyDown(input, { key: "Enter" });
    expect(props.onSubmit).toHaveBeenCalledOnce();
    fireEvent.keyDown(input, { key: "Escape" });
    expect(props.onChange).toHaveBeenLastCalledWith("");
    fireEvent.keyDown(input, { key: "a" });
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("clears from the button and announces empty results", () => {
    const props = renderBar(true);
    fireEvent.click(screen.getByRole("button", { name: "tray.clearFilter" }));
    expect(props.onChange).toHaveBeenCalledWith("");
    expect(screen.getByRole("status").textContent).toBe("tray.noFilterResults");
  });
});
