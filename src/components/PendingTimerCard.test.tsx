// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import PendingTimerCard from "./PendingTimerCard";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, options?: Record<string, unknown>) =>
      options ? `${key}:${JSON.stringify(options)}` : key,
  }),
}));

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

const preview = {
  project: "Alpha", activity: "Work", projectColor: "#ff0000", activityColor: "", customerColor: "",
  description: "Review",
};

describe("PendingTimerCard", () => {
  it("mirrors the full active card while the start is in flight", () => {
    render(<PendingTimerCard preview={preview} focusMode />);
    const card = screen.getByRole("status", { name: "tray.starting" });
    expect(card.textContent).toContain("Alpha");
    expect(card.textContent).toContain("Review");
    expect(card.textContent).toContain("00:00:00");
    expect(card.querySelector(".text-2xl")).toBeTruthy();
  });

  it("renders the compact variant without a description", () => {
    render(<PendingTimerCard preview={{ ...preview, description: "" }} compact colorMode="project" />);
    const card = screen.getByRole("status", { name: "tray.starting" });
    expect(card.textContent).toContain("Work");
    expect(card.textContent).not.toContain("Review");
  });

  it("uses the regular timer size outside the focus layout", () => {
    render(<PendingTimerCard preview={{ ...preview, description: undefined }} />);
    expect(screen.getByRole("status").querySelector(".text-lg")).toBeTruthy();
  });

  it("reserves note and tag rows like the active card", () => {
    const { rerender } = render(
      <PendingTimerCard preview={{ ...preview, description: "" }} showNote showTags />,
    );
    const card = () => screen.getByRole("status");
    expect(card().textContent).toContain("timer.addNote");
    expect(card().textContent).toContain("tags.addTags");

    rerender(<PendingTimerCard preview={{ ...preview, tags: ["urgent"] }} showNote showTags />);
    expect(card().textContent).toContain("urgent");
    expect(card().textContent).not.toContain("tags.addTags");
  });

  it("counts down to the next retry and offers retry now and cancel", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-09T10:00:00Z"));
    const onRetryNow = vi.fn();
    const onCancelRetry = vi.fn();
    const retry = { label: "Alpha", attempt: 1, nextRetryAt: Date.now() + 5_000, lastError: "offline" };
    render(<PendingTimerCard preview={preview} retry={retry} onRetryNow={onRetryNow} onCancelRetry={onCancelRetry} />);

    expect(screen.getByTitle("offline").textContent).toContain('tray.startRetryIn:{"seconds":5,"attempt":2}');
    act(() => { vi.advanceTimersByTime(2_000); });
    expect(screen.getByTitle("offline").textContent).toContain('"seconds":3');

    fireEvent.click(screen.getByRole("button", { name: "tray.retryNow" }));
    fireEvent.click(screen.getByRole("button", { name: "common.cancel" }));
    expect(onRetryNow).toHaveBeenCalledOnce();
    expect(onCancelRetry).toHaveBeenCalledOnce();
  });

  it("shows an in-flight retry in the compact card without a retry now action", () => {
    const retry = { label: "Alpha", attempt: 2, nextRetryAt: null, lastError: "offline" };
    render(<PendingTimerCard preview={preview} compact retry={retry} onRetryNow={vi.fn()} />);

    expect(screen.getByTitle("offline").textContent).toContain('tray.startRetrying:{"attempt":3}');
    expect(screen.queryByRole("button", { name: "tray.retryNow" })).toBeNull();
    expect(screen.queryByRole("button", { name: "common.cancel" })).toBeNull();
  });
});
