// @vitest-environment jsdom

import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { I18nextProvider } from "react-i18next";
import { KimaiApiError } from "../api/kimaiClient";
import i18n, { initPromise } from "../shared/i18n";
import type { TodayEntry } from "../types";

vi.mock("./DateTimePicker", () => ({
  default: ({ id, value, onChange, disabled }: any) => (
    <input id={id} value={value} disabled={disabled} onChange={(event) => onChange(event.target.value)} />
  ),
}));

import TimesheetEditDialog from "./TimesheetEditDialog";

beforeAll(async () => {
  await initPromise;
  await i18n.changeLanguage("en");
});
afterEach(cleanup);

const entry: TodayEntry = {
  id: 42,
  projectId: 1,
  activityId: 2,
  project: "Forest",
  projectColor: "",
  activityColor: "",
  customerColor: "",
  customer: "Customer",
  activity: "Work",
  description: "",
  tags: [],
  billable: true,
  beginIso: "2026-07-22T09:00:00",
  endIso: "2026-07-22T10:00:00",
  duration: 3_600,
  isRunning: false,
};

function setup(onSave: any = vi.fn().mockResolvedValue(undefined), current = entry) {
  const onClose = vi.fn();
  const result = render(
    <I18nextProvider i18n={i18n}>
      <TimesheetEditDialog entry={current} onSave={onSave} onClose={onClose} />
    </I18nextProvider>,
  );
  return { ...result, onClose, onSave };
}

describe("TimesheetEditDialog extra behavior", () => {
  it("reports invalid date text and clears the error on change", async () => {
    const user = userEvent.setup();
    const { onSave } = setup();
    fireEvent.change(screen.getByLabelText("Start time"), { target: { value: "invalid" } });
    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(screen.getByRole("alert").textContent).toMatch(/Invalid time/i);
    expect(onSave).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText("Start time"), { target: { value: "2026-07-22T08:00" } });
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it.each([
    [new KimaiApiError(401, "Unauthorized", null, "unauthorized"), /authentication|unauthorized/i],
    [new Error("network down"), /network down/i],
    ["unknown", /Could not update/i],
  ])("maps save failure %s", async (failure, message) => {
    const user = userEvent.setup();
    setup(vi.fn().mockRejectedValue(failure));
    fireEvent.change(screen.getByLabelText("End time"), { target: { value: "2026-07-22T11:00" } });
    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(await screen.findByText(message)).toBeTruthy();
  });

  it("does not close on Escape while saving and ignores a duplicate save", async () => {
    let resolveSave!: () => void;
    const onSave = vi.fn(() => new Promise<void>((resolve) => { resolveSave = resolve; }));
    const { onClose } = setup(onSave);
    fireEvent.change(screen.getByLabelText("End time"), { target: { value: "2026-07-22T11:00" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await screen.findByRole("button", { name: "Saving…" });
    fireEvent.keyDown(document, { key: "Escape" });
    fireEvent.click(screen.getByRole("button", { name: "Saving…" }));
    expect(onClose).not.toHaveBeenCalled();
    expect(onSave).toHaveBeenCalledOnce();
    resolveSave();
    await waitFor(() => expect(onClose).toHaveBeenCalledOnce());
  });

  it("closes on Escape, traps Tab in both directions and restores focus", async () => {
    const outside = document.createElement("button");
    document.body.appendChild(outside);
    outside.focus();
    const { onClose, unmount } = setup();
    const buttons = Array.from(screen.getByRole("dialog").querySelectorAll("button"));
    buttons[1].focus();
    fireEvent.keyDown(document, { key: "Tab" });
    expect(document.activeElement).toBe(buttons[0]);
    buttons[0].focus();
    fireEvent.keyDown(document, { key: "Tab", shiftKey: true });
    expect(document.activeElement).toBe(buttons[1]);
    const prevented = new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true });
    prevented.preventDefault();
    document.dispatchEvent(prevented);
    expect(onClose).not.toHaveBeenCalled();
    fireEvent.keyDown(document, { key: "x" });
    screen.getByRole("dialog").querySelectorAll("button, input").forEach((control) => control.setAttribute("disabled", ""));
    fireEvent.keyDown(document, { key: "Tab" });
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalledOnce();
    unmount();
    await new Promise((resolve) => requestAnimationFrame(resolve));
    expect(document.activeElement).toBe(outside);
    outside.remove();
  });

  it("resets draft and errors when the entry changes", async () => {
    const user = userEvent.setup();
    const { rerender } = setup(vi.fn().mockRejectedValue(new Error("failure")));
    fireEvent.change(screen.getByLabelText("End time"), { target: { value: "2026-07-22T11:00" } });
    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(await screen.findByText("failure")).toBeTruthy();
    rerender(
      <I18nextProvider i18n={i18n}>
        <TimesheetEditDialog entry={{ ...entry, id: 43, beginIso: "2026-07-23T08:00:00", endIso: "2026-07-23T09:00:00" }} onSave={vi.fn()} onClose={vi.fn()} />
      </I18nextProvider>,
    );
    expect((screen.getByLabelText("Start time") as HTMLInputElement).value).toContain("2026-07-23T08:00");
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.getByText("1h 00m")).toBeTruthy();
  });
});
