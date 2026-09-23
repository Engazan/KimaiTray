// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { TodayEntry } from "../types";
import TodaySection from "./TodaySection";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, values?: Record<string, unknown>) =>
      values ? `${key}:${JSON.stringify(values)}` : key,
    i18n: { resolvedLanguage: "en" },
  }),
}));
vi.mock("./contextMenu", () => ({ showContextMenu: vi.fn(), separator: () => ({ kind: "separator" }) }));

afterEach(() => cleanup());

function entry(id: number, begin: string, end: string): TodayEntry {
  return {
    id, projectId: 1, activityId: 1, project: `Project ${id}`, projectColor: "", activityColor: "",
    customerColor: "", customer: "", activity: "A", description: "", tags: [], billable: false,
    beginIso: `2026-09-23T${begin}:00`, endIso: `2026-09-23T${end}:00`, duration: 3600, isRunning: false,
  };
}

const later = entry(2, "11:00", "12:00");
const earlier = entry(1, "09:00", "10:00");

function renderSection(props: Partial<Parameters<typeof TodaySection>[0]>) {
  return render(
    <TodaySection
      entries={[later, earlier]}
      totalCount={2}
      totalDuration={7200}
      hasMore={false}
      expanded={false}
      onToggleExpand={vi.fn()}
      sortAsc={false}
      onToggleSort={vi.fn()}
      isLoading={false}
      isError={false}
      onRetry={vi.fn()}
      {...props}
    />,
  );
}

describe("TodaySection gaps and timeline", () => {
  it("renders a fill-gap row between entries in newest-first order", () => {
    const onFillGap = vi.fn();
    renderSection({ onFillGap, timelineEntries: [later, earlier] });

    const gap = screen.getByRole("button", { name: /today.untracked/ });
    const rows = screen.getAllByText(/Project \d|today.untracked/).map((node) => node.textContent);
    expect(rows[0]).toBe("Project 2");
    expect(rows[1]).toContain("today.untracked");
    expect(rows[2]).toBe("Project 1");

    fireEvent.click(gap);
    expect(onFillGap).toHaveBeenCalledWith("2026-09-23T10:00:00");
    expect(screen.getByRole("img", { name: "today.timeline" })).toBeTruthy();
  });

  it("places the gap before the later entry in oldest-first order", () => {
    renderSection({ entries: [earlier, later], sortAsc: true, onFillGap: vi.fn() });

    const rows = screen.getAllByText(/Project \d|today.untracked/).map((node) => node.textContent);
    expect(rows[1]).toContain("today.untracked");
  });

  it("hides gaps when filling is unavailable", () => {
    renderSection({});

    expect(screen.queryByRole("button", { name: /today.untracked/ })).toBeNull();
    expect(screen.queryByRole("img", { name: "today.timeline" })).toBeNull();
  });
});
