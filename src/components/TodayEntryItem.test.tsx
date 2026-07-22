// @vitest-environment jsdom

import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { I18nextProvider } from "react-i18next";
import i18n, { initPromise } from "../shared/i18n";
import type { TodayEntry } from "../types";
import TodayEntryItem from "./TodayEntryItem";

beforeAll(async () => {
  await initPromise;
  await i18n.changeLanguage("en");
});

afterEach(() => cleanup());

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

function renderEntry(value: TodayEntry, onEdit = vi.fn()) {
  render(
    <I18nextProvider i18n={i18n}>
      <TodayEntryItem entry={value} onEdit={onEdit} />
    </I18nextProvider>,
  );
  return onEdit;
}

describe("TodayEntryItem editing", () => {
  it("opens editing for a completed entry", async () => {
    const onEdit = renderEntry(entry);

    const timeButton = screen.getByRole("button", {
      name: "Edit Forest time entry",
    });

    expect(timeButton.textContent).toContain("09:00");
    expect(timeButton.textContent).toContain("10:00");
    expect(timeButton.firstElementChild?.children).toHaveLength(2);

    await userEvent.click(timeButton);

    expect(onEdit).toHaveBeenCalledWith(entry);
  });

  it("does not offer the completed-entry editor for a running timer", () => {
    renderEntry({ ...entry, isRunning: true, endIso: null });

    expect(
      screen.queryByRole("button", { name: /Edit Forest time entry/i }),
    ).toBeNull();
  });
});
