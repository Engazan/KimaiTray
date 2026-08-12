// @vitest-environment jsdom

import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { I18nextProvider } from "react-i18next";
import i18n, { initPromise } from "../shared/i18n";
import TagsInput from "./TagsInput";

beforeAll(async () => {
  Element.prototype.scrollIntoView = vi.fn();
  await initPromise;
  await i18n.changeLanguage("en");
});

beforeEach(() => vi.clearAllMocks());
afterEach(cleanup);

const suggestions = [
  { name: "Álpha", color: "#ff0000" },
  { name: "Beta", color: null },
  { name: "Gamma", color: "#00ff00" },
];

function renderInput(overrides: Record<string, unknown> = {}) {
  const onChange = vi.fn();
  const onCommit = vi.fn();
  const result = render(
    <I18nextProvider i18n={i18n}>
      <TagsInput id="tags" tags={[]} onChange={onChange} onCommit={onCommit} suggestions={suggestions} {...overrides} />
    </I18nextProvider>,
  );
  return { ...result, onChange, onCommit };
}

describe("TagsInput", () => {
  it("filters accent-insensitively and selects by mouse", async () => {
    const user = userEvent.setup();
    const { onChange } = renderInput();
    const input = screen.getByRole("combobox");
    await user.type(input, "alpha");
    expect(screen.getByRole("option", { name: "Álpha" })).toBeTruthy();
    await user.click(screen.getByRole("option", { name: "Álpha" }));
    expect(onChange).toHaveBeenCalledWith(["Álpha"]);
  });

  it("navigates both directions and selects highlighted suggestions", async () => {
    const user = userEvent.setup();
    const { onChange } = renderInput();
    const input = screen.getByRole("combobox");
    await user.click(input);
    await user.keyboard("{ArrowDown}{ArrowUp}{Enter}");
    expect(onChange).toHaveBeenCalledWith(["Álpha"]);
  });

  it("commits with empty Enter or Escape and closes an open popup first", async () => {
    const user = userEvent.setup();
    const { onCommit } = renderInput({ suggestions: [] });
    const input = screen.getByRole("combobox");
    await user.click(input);
    await user.keyboard("{Escape}");
    expect(onCommit).not.toHaveBeenCalled();
    await user.keyboard("{Escape}");
    expect(onCommit).toHaveBeenCalledOnce();
    await user.keyboard("{Enter}");
    expect(onCommit).toHaveBeenCalledTimes(2);
  });

  it("removes the last tag with Backspace and removes any tag by button", async () => {
    const user = userEvent.setup();
    const { onChange } = renderInput({ tags: ["Alpha", "Beta"] });
    const input = screen.getByRole("combobox");
    await user.click(input);
    await user.keyboard("{Backspace}");
    expect(onChange).toHaveBeenCalledWith(["Alpha"]);
    await user.click(screen.getAllByRole("button", { name: "×" })[0]);
    expect(onChange).toHaveBeenCalledWith(["Beta"]);
  });

  it("excludes selected tags, reports no matches and closes outside", async () => {
    const user = userEvent.setup();
    renderInput({ tags: ["alpha"] });
    const input = screen.getByRole("combobox");
    await user.type(input, "missing");
    expect(screen.getByText(/No matching tags/)).toBeTruthy();
    fireEvent.mouseDown(document.body);
    expect(screen.queryByRole("listbox")).toBeNull();
  });

  it("shows the no-tags state and does nothing for arrows without options", async () => {
    const user = userEvent.setup();
    const { onChange } = renderInput({ suggestions: [] });
    const input = screen.getByRole("combobox");
    await user.click(input);
    expect(screen.getByText(/No tags/)).toBeTruthy();
    await user.keyboard("{ArrowDown}{ArrowUp}");
    expect(onChange).not.toHaveBeenCalled();
  });

  it("renders disabled and medium-size variants without removal actions", () => {
    renderInput({ tags: ["Álpha"], disabled: true, size: "md" });
    expect((screen.getByRole("combobox") as HTMLInputElement).disabled).toBe(true);
    expect(screen.queryByRole("button", { name: "×" })).toBeNull();
    expect(screen.queryByRole("listbox")).toBeNull();
  });

  it("ignores a whitespace-only suggestion", async () => {
    const user = userEvent.setup();
    const { onChange } = renderInput({ suggestions: [{ name: "   ", color: null }] });
    await user.click(screen.getByRole("combobox"));
    fireEvent.click(screen.getByRole("option"));
    expect(onChange).not.toHaveBeenCalled();
  });
});
