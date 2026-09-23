// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import type { TodayEntry } from "../types";
import TodayTimelineBar from "./TodayTimelineBar";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

afterEach(() => cleanup());

function entry(id: number, begin: string, end: string | null, color = "#ff0000"): TodayEntry {
  return {
    id, projectId: 1, activityId: 1, project: `Project ${id}`, projectColor: color, activityColor: "",
    customerColor: "", customer: "", activity: "A", description: "", tags: [], billable: false,
    beginIso: `2026-09-23T${begin}:00`, endIso: end ? `2026-09-23T${end}:00` : null,
    duration: null, isRunning: end === null,
  };
}

const now = new Date("2026-09-23T12:00:00").getTime();

describe("TodayTimelineBar", () => {
  it("positions one segment per entry across the tracked span", () => {
    render(
      <TodayTimelineBar
        entries={[entry(1, "08:00", "09:00"), entry(2, "10:00", null, "#00ff00")]}
        colorMode="project"
        nowMs={now}
      />,
    );

    expect(screen.getByRole("img", { name: "today.timeline" })).toBeTruthy();
    const [first, running] = screen.getAllByTestId("timeline-segment");
    expect(first.style.left).toBe("0%");
    expect(first.style.backgroundColor).toBe("rgb(255, 0, 0)");
    expect(first.title).toContain("Project 1");
    expect(running.style.left).toBe("50%");
    expect(running.className).toContain("animate-pulse");
    expect(running.title).toContain("common.now");
  });

  it("renders nothing without at least two entries or a positive span", () => {
    const { container, rerender } = render(<TodayTimelineBar entries={[entry(1, "08:00", "09:00")]} nowMs={now} />);
    expect(container.innerHTML).toBe("");

    rerender(<TodayTimelineBar entries={[entry(1, "08:00", "08:00"), entry(2, "08:00", "07:00")]} />);
    expect(container.innerHTML).toBe("");
  });
});
