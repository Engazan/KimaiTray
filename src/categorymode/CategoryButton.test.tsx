// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import CategoryButton from "./CategoryButton";

afterEach(() => cleanup());

describe("category button states", () => {
  it("renders visual identity and dispatches drilldown", () => {
    const onClick = vi.fn();
    render(
      <CategoryButton
        label="Support"
        sublabel="Choose activity"
        icon="headset"
        color="emerald"
        drilldown
        onClick={onClick}
      />,
    );

    const button = screen.getByRole("button", { name: /Support/ });
    fireEvent.click(button);
    expect(onClick).toHaveBeenCalledOnce();
    expect(screen.getByText("Choose activity")).toBeTruthy();
    expect(button.querySelector("svg")).toBeTruthy();
  });

  it("shows warning, spinner and disabled states", () => {
    const { rerender } = render(
      <CategoryButton
        label="Missing activity"
        sublabel="Not found"
        warning
        color="rose"
        onClick={vi.fn()}
      />,
    );
    expect(screen.getByText("Not found").className).toContain("text-red-500");

    rerender(
      <CategoryButton
        label="Starting"
        isStarting
        disabled
        onClick={vi.fn()}
      />,
    );
    expect((screen.getByRole("button") as HTMLButtonElement).disabled).toBe(true);
    expect(document.querySelector(".animate-spin")).toBeTruthy();
  });
});
