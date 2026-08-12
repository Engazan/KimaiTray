// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import DateTimePicker from "./DateTimePicker";

const mocks = vi.hoisted(() => ({ language: "en" }));
vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (key: string) => key, i18n: { language: mocks.language } }) }));

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  mocks.language = "en";
  vi.setSystemTime(new Date(2026, 0, 15, 12, 34));
  vi.spyOn(window, "requestAnimationFrame").mockImplementation((cb) => { cb(0); return 1; });
  vi.spyOn(window, "cancelAnimationFrame").mockImplementation(() => {});
});
afterEach(() => { cleanup(); vi.useRealTimers(); vi.restoreAllMocks(); });

describe("DateTimePicker", () => {
  it("renders empty and disabled values without opening", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    const { rerender } = render(<DateTimePicker value="" onChange={vi.fn()} compact disabled />);
    expect(screen.getByText("—")).toBeTruthy();
    await user.click(screen.getByRole("button"));
    expect(screen.queryByRole("dialog")).toBeNull();
    rerender(<DateTimePicker value="2026-01-15T08:05" onChange={vi.fn()} className="custom" />);
    expect(screen.getByRole("button").className).toBe("custom");
  });

  it("opens, selects a day and current time, then closes from outside", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    const onChange = vi.fn();
    const onClose = vi.fn();
    render(<DateTimePicker id="date" value="2026-01-15T08:05" onChange={onChange} onClose={onClose} />);
    const trigger = screen.getByRole("button", { expanded: false });
    await user.click(trigger);
    expect(screen.getByRole("dialog").getAttribute("aria-label")).toContain("January");
    await user.click(screen.getByRole("button", { name: "20" }));
    expect(onChange).toHaveBeenCalledWith("2026-01-20T08:05");
    await user.click(screen.getByRole("button", { name: "common.now" }));
    expect(onChange).toHaveBeenCalledWith("2026-01-15T12:34");
    fireEvent.mouseDown(document.body);
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(onClose).toHaveBeenCalled();
    expect(document.activeElement).toBe(trigger);
  });

  it("closes via Escape and the trigger toggle", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(<DateTimePicker value="2026-01-15T08:05" onChange={vi.fn()} />);
    const trigger = screen.getByRole("button", { expanded: false });
    await user.click(trigger);
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
    await user.click(trigger);
    await user.click(trigger);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("navigates across year boundaries", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(<DateTimePicker value="2026-01-15T08:05" onChange={vi.fn()} />);
    await user.click(screen.getByRole("button", { expanded: false }));
    await user.click(screen.getByRole("button", { name: "common.previousMonth" }));
    expect(screen.getByRole("dialog").getAttribute("aria-label")).toContain("December 2025");
    await user.click(screen.getByRole("button", { name: "common.nextMonth" }));
    expect(screen.getByRole("dialog").getAttribute("aria-label")).toContain("January 2026");
    cleanup();

    render(<DateTimePicker value="2026-12-15T08:05" onChange={vi.fn()} />);
    await user.click(screen.getByRole("button", { expanded: false }));
    await user.click(screen.getByRole("button", { name: "common.nextMonth" }));
    expect(screen.getByRole("dialog").getAttribute("aria-label")).toContain("January 2027");

    await user.click(screen.getByRole("button", { name: "common.previousMonth" }));
    await user.click(screen.getByRole("button", { name: "common.previousMonth" }));
    expect(screen.getByRole("dialog").getAttribute("aria-label")).toContain("November 2026");
    await user.click(screen.getByRole("button", { name: "common.nextMonth" }));
    expect(screen.getByRole("dialog").getAttribute("aria-label")).toContain("December 2026");
  });

  it("accepts valid time edits and resets invalid input to the parsed time", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    const onChange = vi.fn();
    render(<DateTimePicker value="2026-01-15T08:05" onChange={onChange} />);
    await user.click(screen.getByRole("button", { expanded: false }));
    const inputs = screen.getByRole("dialog").querySelectorAll("input");
    fireEvent.change(inputs[0], { target: { value: "9x" } });
    fireEvent.change(inputs[1], { target: { value: "7" } });
    fireEvent.blur(inputs[1]);
    expect(onChange).toHaveBeenCalledWith("2026-01-15T09:07");
    fireEvent.change(inputs[0], { target: { value: "99" } });
    fireEvent.blur(inputs[0]);
    expect((inputs[0] as HTMLInputElement).value).toBe("08");
    expect((inputs[1] as HTMLInputElement).value).toBe("05");
  });

  it("uses zero time for an empty value when choosing a day", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    const onChange = vi.fn();
    render(<DateTimePicker value="" onChange={onChange} />);
    await user.click(screen.getByRole("button", { expanded: false }));
    const inputs = screen.getByRole("dialog").querySelectorAll("input");
    fireEvent.change(inputs[0], { target: { value: "" } });
    fireEvent.change(inputs[1], { target: { value: "" } });
    await user.click(screen.getByRole("button", { name: "2" }));
    expect(onChange).toHaveBeenCalledWith("2026-01-02T00:00");
  });

  it("traps forward and reverse tab navigation inside the dialog", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(<DateTimePicker value="2026-01-15T08:05" onChange={vi.fn()} />);
    await user.click(screen.getByRole("button", { expanded: false }));
    const dialog = screen.getByRole("dialog");
    const focusable = dialog.querySelectorAll<HTMLElement>("button:not(:disabled), input:not(:disabled)");
    focusable[0].focus();
    fireEvent.keyDown(dialog, { key: "Tab", shiftKey: true });
    expect(document.activeElement).toBe(focusable[focusable.length - 1]);
    fireEvent.keyDown(dialog, { key: "Tab", shiftKey: false });
    expect(document.activeElement).toBe(focusable[0]);
    fireEvent.keyDown(dialog, { key: "ArrowDown" });
    expect(screen.getByRole("dialog")).toBeTruthy();
  });

  it("positions above a low trigger and updates on viewport events", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({
      top: 700, bottom: 730, left: -10, right: 100, width: 110, height: 30, x: -10, y: 700, toJSON: () => ({}),
    });
    Object.defineProperty(window, "innerHeight", { configurable: true, value: 740 });
    Object.defineProperty(window, "innerWidth", { configurable: true, value: 200 });
    render(<DateTimePicker value="2026-01-15T08:05" onChange={vi.fn()} />);
    await user.click(screen.getByRole("button", { expanded: false }));
    const dialog = screen.getByRole("dialog");
    fireEvent(window, new Event("resize"));
    fireEvent.scroll(window);
    expect(Number.parseInt(dialog.style.top)).toBeGreaterThanOrEqual(8);
    expect(Number.parseInt(dialog.style.left)).toBeGreaterThanOrEqual(8);
  });

  it("supports Sunday-first month offsets, locale fallback and a missing trigger rectangle", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    mocks.language = "";
    const rect = vi.spyOn(HTMLElement.prototype, "getBoundingClientRect");
    rect.mockReturnValueOnce(undefined as never).mockReturnValue({
      top: 10, bottom: 40, left: 20, right: 100, width: 80, height: 30, x: 20, y: 10, toJSON: () => ({}),
    });
    render(<DateTimePicker value="2026-02-01T08:05" onChange={vi.fn()} />);
    await user.click(screen.getByRole("button", { expanded: false }));
    expect(screen.getByRole("button", { name: "1" }).getAttribute("aria-selected")).toBe("true");

    const dialog = screen.getByRole("dialog");
    dialog.querySelectorAll("button, input").forEach((element) => element.setAttribute("disabled", ""));
    fireEvent.keyDown(dialog, { key: "Tab" });
    expect(screen.getByRole("dialog")).toBeTruthy();
  });
});
