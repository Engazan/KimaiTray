// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import PendingTimerCard from "./PendingTimerCard";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

afterEach(() => cleanup());

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
});
