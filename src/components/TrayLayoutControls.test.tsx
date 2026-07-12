// @vitest-environment jsdom

import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { CollapsibleTraySection, FocusTabs } from "./TrayLayoutControls";

describe("tray layout controls", () => {
  it("switches focus tabs without owning their state", () => {
    const onChange = vi.fn();
    render(
      <FocusTabs
        active="recent"
        recentLabel="Recent"
        todayLabel="Today"
        onChange={onChange}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Today" }));
    expect(onChange).toHaveBeenCalledWith("today");
  });

  it("mounts section content only while expanded", () => {
    const { rerender } = render(
      <CollapsibleTraySection title="Recent" collapsed onToggle={() => {}}>
        <span>Task list</span>
      </CollapsibleTraySection>,
    );
    expect(screen.queryByText("Task list")).toBeNull();

    rerender(
      <CollapsibleTraySection title="Recent" collapsed={false} onToggle={() => {}}>
        <span>Task list</span>
      </CollapsibleTraySection>,
    );
    expect(screen.getByText("Task list")).toBeTruthy();
  });
});
