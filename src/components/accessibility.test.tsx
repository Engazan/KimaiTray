// @vitest-environment jsdom

import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { I18nextProvider } from "react-i18next";
import i18n, { initPromise } from "../shared/i18n";
import SearchableSelect from "./SearchableSelect";
import ApiErrorDialog from "./ApiErrorDialog";
import IdleDialog from "./IdleDialog";
import TagsInput from "./TagsInput";

beforeAll(async () => {
  Element.prototype.scrollIntoView = vi.fn();
  await initPromise;
  await i18n.changeLanguage("en");
});

afterEach(() => cleanup());

function renderLocalized(node: React.ReactNode) {
  return render(<I18nextProvider i18n={i18n}>{node}</I18nextProvider>);
}

describe("accessible custom controls", () => {
  it("supports keyboard filtering and selection in SearchableSelect", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    renderLocalized(
      <SearchableSelect
        options={[
          { value: 1, label: "Alpha" },
          { value: 2, label: "Beta" },
        ]}
        value={null}
        onChange={onChange}
        placeholder="Choose project"
      />,
    );

    await user.click(screen.getByRole("button", { name: /choose project/i }));
    const input = screen.getByRole("combobox");
    expect(input.getAttribute("aria-controls")).toBeTruthy();
    expect(screen.getByRole("listbox")).toBeTruthy();

    await user.type(input, "Beta");
    await user.keyboard("{Enter}");
    expect(onChange).toHaveBeenCalledWith(2);
    expect(screen.queryByRole("listbox")).toBeNull();
  });

  it("exposes API errors as an escapable modal dialog", async () => {
    renderLocalized(<ApiErrorDialog />);
    fireEvent(
      window,
      new CustomEvent("kimai-api-error", {
        detail: {
          status: 500,
          statusText: "Server Error",
          endpoint: "GET /api/timesheets",
          message: "Request failed",
          body: null,
          timestamp: Date.now(),
        },
      }),
    );

    expect(await screen.findByRole("dialog")).toBeTruthy();
    expect(document.activeElement).toBe(
      screen.getByRole("button", { name: /dismiss/i }),
    );
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("traps keyboard focus inside the idle decision dialog", async () => {
    const user = userEvent.setup();
    renderLocalized(
      <IdleDialog
        timer={{
          id: 1,
          projectId: 2,
          activityId: 3,
          project: "Project",
          projectColor: "#000000",
          activityColor: "#000000",
          customerColor: "#000000",
          activity: "Activity",
          description: "",
          tags: [],
          beginSeconds: 0,
          beginIso: "2026-01-01T00:00:00Z",
        }}
        idleStartedAt={new Date("2026-01-01T10:00:00")}
        idleDurationSeconds={600}
        onContinue={vi.fn()}
        onStopAtIdleStart={vi.fn()}
        onStopNow={vi.fn()}
        onStopAndStartNew={vi.fn()}
        isProcessing={false}
      />,
    );

    const dialog = screen.getByRole("dialog", { name: /you were idle/i });
    const buttons = screen.getAllByRole("button");
    expect(document.activeElement).toBe(buttons[0]);
    buttons[buttons.length - 1]?.focus();
    await user.tab();
    expect(document.activeElement).toBe(buttons[0]);
    expect(dialog.getAttribute("aria-modal")).toBe("true");
  });

  it("supports keyboard tag selection and removal", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const { rerender } = renderLocalized(
      <TagsInput
        tags={[]}
        onChange={onChange}
        suggestions={[{ name: "billable", color: "#10b981" }]}
      />,
    );

    const input = screen.getByRole("combobox");
    await user.click(input);
    await user.keyboard("{Enter}");
    expect(onChange).toHaveBeenCalledWith(["billable"]);

    rerender(
      <I18nextProvider i18n={i18n}>
        <TagsInput
          tags={["billable"]}
          onChange={onChange}
          suggestions={[{ name: "billable", color: "#10b981" }]}
        />
      </I18nextProvider>,
    );
    await user.click(screen.getByRole("combobox"));
    await user.keyboard("{Backspace}");
    expect(onChange).toHaveBeenLastCalledWith([]);
  });
});
