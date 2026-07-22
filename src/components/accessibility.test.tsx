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
import DateTimePicker from "./DateTimePicker";
import ChangelogDialog from "./ChangelogDialog";

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

  it("matches canonically equivalent and unaccented select searches", async () => {
    const user = userEvent.setup();
    renderLocalized(
      <SearchableSelect
        options={[{ value: 1, label: "fore\u0302t" }]}
        value={null}
        onChange={vi.fn()}
        placeholder="Choose project"
      />,
    );

    await user.click(screen.getByRole("button", { name: /choose project/i }));
    const input = screen.getByRole("combobox");

    await user.type(input, "for\u00ea");
    expect(screen.getByRole("option", { name: "fore\u0302t" })).toBeTruthy();

    await user.clear(input);
    await user.type(input, "fore");
    expect(screen.getByRole("option", { name: "fore\u0302t" })).toBeTruthy();
  });

  it("opens and focuses SearchableSelect from a keyboard-flow request", async () => {
    renderLocalized(
      <SearchableSelect
        options={[{ value: 1, label: "Alpha" }]}
        value={null}
        onChange={vi.fn()}
        placeholder="Choose project"
        focusRequest={1}
      />,
    );

    const input = await screen.findByRole("combobox");
    expect(document.activeElement).toBe(input);
    expect(screen.getByRole("listbox")).toBeTruthy();
  });

  it("associates custom select triggers with their field labels", () => {
    renderLocalized(
      <div>
        <label htmlFor="project-select">Project</label>
        <SearchableSelect
          id="project-select"
          options={[{ value: 1, label: "Alpha" }]}
          value={null}
          onChange={vi.fn()}
          placeholder="Choose project"
        />
      </div>,
    );

    expect(screen.getByLabelText("Project")).toBe(
      screen.getByRole("button", { name: "Project" }),
    );
  });

  it("exposes API errors as an escapable modal dialog", async () => {
    renderLocalized(
      <>
        <button type="button">Return target</button>
        <ApiErrorDialog />
      </>,
    );
    const returnTarget = screen.getByRole("button", { name: "Return target" });
    returnTarget.focus();
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
    await new Promise((resolve) => requestAnimationFrame(resolve));
    expect(document.activeElement).toBe(returnTarget);
  });

  it("exposes the update changelog as an escapable modal dialog", async () => {
    const onClose = vi.fn();
    renderLocalized(
      <ChangelogDialog
        version="2.1.0"
        body={"### New Features\n\n- **Faster updates** for everyone"}
        onClose={onClose}
      />,
    );

    const dialog = screen.getByRole("dialog", { name: /what's new/i });
    expect(dialog.getAttribute("aria-modal")).toBe("true");
    expect(screen.getByText("Faster updates").tagName).toBe("STRONG");
    expect(document.activeElement).toBe(
      screen.getAllByRole("button", { name: /close/i })[0],
    );

    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalledOnce();
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
        error="Failed to stop timer"
      />,
    );

    const dialog = screen.getByRole("dialog", { name: /you were idle/i });
    const buttons = screen.getAllByRole("button");
    expect(document.activeElement).toBe(buttons[0]);
    buttons[buttons.length - 1]?.focus();
    await user.tab();
    expect(document.activeElement).toBe(buttons[0]);
    expect(dialog.getAttribute("aria-modal")).toBe("true");
    expect(screen.getByRole("alert").textContent).toMatch(/failed to stop/i);
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

  it("manages focus and Escape for the date-time modal", async () => {
    const user = userEvent.setup();
    renderLocalized(
      <DateTimePicker
        value="2026-07-11T09:30"
        onChange={vi.fn()}
      />,
    );

    const trigger = screen.getByRole("button", { expanded: false });
    await user.click(trigger);
    const dialog = screen.getByRole("dialog");
    await new Promise((resolve) => requestAnimationFrame(resolve));
    expect(dialog.contains(document.activeElement)).toBe(true);

    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).toBeNull();
    await new Promise((resolve) => requestAnimationFrame(resolve));
    expect(document.activeElement).toBe(trigger);
  });
});
