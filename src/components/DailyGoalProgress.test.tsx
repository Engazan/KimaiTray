// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import DailyGoalProgress, {
  getDailyGoalProgressState,
} from "./DailyGoalProgress";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, values?: Record<string, string>) =>
      values
        ? `${key} ${Object.values(values).join(" ")}`
        : key,
    i18n: { resolvedLanguage: "en" },
  }),
}));

describe("daily goal progress", () => {
  it("targets the required goal first and estimates its completion", () => {
    const now = new Date("2026-07-20T12:00:00Z").getTime();
    const state = getDailyGoalProgressState(
      6 * 60 * 60,
      7 * 60 + 30,
      8 * 60,
      true,
      now,
    );

    expect(state.progressPercent).toBe(75);
    expect(state.requiredMarkerPercent).toBe(93.75);
    expect(state.nextMilestone).toBe("required");
    expect(state.remainingSeconds).toBe(90 * 60);
    expect(state.estimatedCompletionMs).toBe(now + 90 * 60 * 1000);
  });

  it("switches to the full goal after the required goal is reached", () => {
    const state = getDailyGoalProgressState(
      (7 * 60 + 45) * 60,
      7 * 60 + 30,
      8 * 60,
      false,
    );

    expect(state.nextMilestone).toBe("full");
    expect(state.remainingSeconds).toBe(15 * 60);
    expect(state.estimatedCompletionMs).toBeNull();
  });

  it("caps completed progress at 100 percent", () => {
    const state = getDailyGoalProgressState(
      9 * 60 * 60,
      7 * 60 + 30,
      8 * 60,
      true,
    );

    expect(state.nextMilestone).toBe("complete");
    expect(state.progressPercent).toBe(100);
    expect(state.remainingSeconds).toBe(0);
    expect(state.estimatedCompletionMs).toBeNull();
  });

  it("renders compact by default and toggles the accessible details", async () => {
    const user = userEvent.setup();
    render(
      <DailyGoalProgress
        totalDuration={6 * 60 * 60}
        requiredMinutes={7 * 60 + 30}
        fullMinutes={8 * 60}
        isTimerRunning={false}
      />,
    );

    const progress = screen.getByRole("progressbar", {
      name: "today.dailyGoal",
    });
    expect(progress.getAttribute("aria-valuenow")).toBe("21600");
    expect(progress.getAttribute("aria-valuemax")).toBe("28800");
    expect(screen.queryByText("today.startTimerForEstimate")).toBeNull();

    const toggle = screen.getByRole("button", {
      name: "today.expandDailyGoal",
    });
    expect(toggle.getAttribute("aria-expanded")).toBe("false");

    await user.click(toggle);
    expect(
      screen
        .getByRole("button", { name: "today.collapseDailyGoal" })
        .getAttribute("aria-expanded"),
    ).toBe("true");
    expect(screen.getByText("today.startTimerForEstimate")).toBeTruthy();

    await user.click(
      screen.getByRole("button", { name: "today.collapseDailyGoal" }),
    );
    expect(screen.queryByText("today.startTimerForEstimate")).toBeNull();
  });
});
