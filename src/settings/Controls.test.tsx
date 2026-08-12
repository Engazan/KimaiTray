// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  Divider,
  FieldGroup,
  NumberInput,
  SectionDescription,
  SectionTitle,
  Select,
  ShortcutInput,
  TextInput,
  Toggle,
  formatAcceleratorForDisplay,
} from "./Controls";

const platform = vi.hoisted(() => ({ os: "macos" }));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock("../platform", () => ({
  currentPlatform: () => ({ os: platform.os }),
}));

afterEach(cleanup);

describe("settings controls", () => {
  it("renders field wrappers and section helpers", () => {
    const { rerender, container } = render(
      <>
        <FieldGroup label="Name" description="Help"><span>value</span></FieldGroup>
        <SectionTitle>Title</SectionTitle>
        <SectionDescription>Description</SectionDescription>
        <Divider />
      </>,
    );

    expect(screen.getByRole("group", { name: "Name" }).textContent).toBe("value");
    expect(screen.getByRole("heading", { name: "Title" })).toBeTruthy();
    expect(screen.getByText("Help")).toBeTruthy();
    expect(container.querySelector(".border-t")).toBeTruthy();

    rerender(<FieldGroup horizontal label="Horizontal"><span>child</span></FieldGroup>);
    expect(screen.getByRole("group", { name: "Horizontal" })).toBeTruthy();
  });

  it("emits values from toggle, text, number and select controls", async () => {
    const user = userEvent.setup();
    const toggle = vi.fn();
    const text = vi.fn();
    const number = vi.fn();
    const select = vi.fn();
    render(
      <>
        <Toggle checked={false} onChange={toggle} />
        <TextInput value="old" type="password" placeholder="placeholder" onChange={text} />
        <NumberInput value={5} min={1} max={10} step={2} suffix="min" onChange={number} />
        <Select value="a" options={[{ value: "a", label: "A" }, { value: 2, label: "Two" }]} onChange={select} />
      </>,
    );

    await user.click(screen.getByRole("switch"));
    fireEvent.change(screen.getByPlaceholderText("placeholder"), { target: { value: "new" } });
    fireEvent.change(screen.getByRole("spinbutton"), { target: { value: "9" } });
    await user.selectOptions(screen.getByRole("combobox"), "2");

    expect(toggle).toHaveBeenCalledWith(true);
    expect(text).toHaveBeenCalledWith("new");
    expect(number).toHaveBeenCalledWith(9);
    expect(select).toHaveBeenCalledWith("2");
    expect(screen.getByText("min")).toBeTruthy();
  });

  it("does not invoke disabled controls", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <>
        <Toggle checked disabled onChange={onChange} />
        <TextInput value="locked" disabled onChange={onChange} />
        <NumberInput value={3} disabled onChange={onChange} />
        <Select value="a" disabled options={[{ value: "a", label: "A" }]} onChange={onChange} />
      </>,
    );

    const controls = [
      screen.getByRole("switch"),
      screen.getByRole("textbox"),
      screen.getByRole("spinbutton"),
      screen.getByRole("combobox"),
    ];
    for (const control of controls) {
      await user.click(control);
      expect((control as HTMLInputElement).disabled).toBe(true);
    }
    expect(onChange).not.toHaveBeenCalled();
  });

  it("formats accelerators for macOS and other platforms", () => {
    platform.os = "macos";
    expect(formatAcceleratorForDisplay("CommandOrControl+Alt+Shift+K")).toBe("⌘⌥⇧K");
    expect(formatAcceleratorForDisplay("")).toBe("");

    platform.os = "linux";
    expect(formatAcceleratorForDisplay("CommandOrControl+Alt+Shift+K")).toBe("Ctrl+Alt+Shift+K");
  });

  it("records, cancels and clears keyboard shortcuts", async () => {
    platform.os = "linux";
    const user = userEvent.setup();
    const onChange = vi.fn();
    const { rerender } = render(<ShortcutInput value="" onChange={onChange} />);

    const button = screen.getByRole("button", { name: "shortcuts.notSet" });
    await user.click(button);
    expect(screen.getByRole("button", { name: "shortcuts.recording" })).toBeTruthy();
    fireEvent.keyDown(window, { key: "Control", code: "ControlLeft", ctrlKey: true });
    expect(onChange).not.toHaveBeenCalled();
    fireEvent.keyDown(window, { key: "k", code: "KeyK", ctrlKey: true, shiftKey: true });
    expect(onChange).toHaveBeenCalledWith("CommandOrControl+Shift+K");

    await user.click(screen.getByRole("button", { name: "shortcuts.notSet" }));
    fireEvent.keyDown(window, { key: "7", code: "Digit7", altKey: true });
    expect(onChange).toHaveBeenLastCalledWith("Alt+7");

    await user.click(screen.getByRole("button", { name: "shortcuts.notSet" }));
    fireEvent.keyDown(window, { key: "F8", code: "F8", metaKey: true });
    expect(onChange).toHaveBeenLastCalledWith("CommandOrControl+F8");

    await user.click(screen.getByRole("button", { name: "shortcuts.notSet" }));
    fireEvent.keyDown(window, { key: "F9", code: "F9" });
    expect(onChange).toHaveBeenCalledTimes(3);
    fireEvent.keyDown(window, { key: "Escape", code: "Escape" });

    rerender(<ShortcutInput value="CommandOrControl+1" onChange={onChange} />);
    await user.click(screen.getByTitle("shortcuts.clearShortcut"));
    expect(onChange).toHaveBeenLastCalledWith("");

    await user.click(screen.getByRole("button", { name: "Ctrl+1" }));
    fireEvent.keyDown(window, { key: "Escape", code: "Escape" });
    expect(screen.getByRole("button", { name: "Ctrl+1" })).toBeTruthy();
  });

  it("stops recording on blur and ignores clicks while disabled", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const { rerender } = render(<ShortcutInput value="" onChange={onChange} />);

    const button = screen.getByRole("button");
    await user.click(button);
    fireEvent.blur(button);
    expect(screen.getByRole("button", { name: "shortcuts.notSet" })).toBeTruthy();

    rerender(<ShortcutInput value="CommandOrControl+K" disabled onChange={onChange} />);
    await user.click(screen.getByRole("button"));
    expect(screen.queryByText("shortcuts.recording")).toBeNull();
    expect(screen.queryByTitle("shortcuts.clearShortcut")).toBeNull();
  });
});
