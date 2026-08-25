// @vitest-environment jsdom

import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { I18nextProvider } from "react-i18next";
import { KimaiApiError } from "../api/kimaiClient";
import i18n, { initPromise } from "../shared/i18n";
import ActivityCreateDialog from "./ActivityCreateDialog";

beforeAll(async () => {
  await initPromise;
  await i18n.changeLanguage("en");
});

afterEach(() => cleanup());

function renderDialog(onCreate = vi.fn().mockResolvedValue(undefined)) {
  const onClose = vi.fn();
  render(
    <I18nextProvider i18n={i18n}>
      <ActivityCreateDialog
        projectId={42}
        projectName="KimaiTray"
        onCreate={onCreate}
        onClose={onClose}
      />
    </I18nextProvider>,
  );
  return { onCreate, onClose };
}

describe("ActivityCreateDialog", () => {
  it("creates a local activity with Kimai's automatic color", async () => {
    const user = userEvent.setup();
    const { onCreate, onClose } = renderDialog();

    expect(document.activeElement).toBe(screen.getByLabelText("Name"));
    expect(
      screen.getByRole("radio", { name: "Local" }).getAttribute("aria-checked"),
    ).toBe("true");
    expect(
      screen
        .getByRole("radio", { name: "Automatic" })
        .getAttribute("aria-checked"),
    ).toBe("true");
    await user.type(screen.getByLabelText("Name"), "Development");
    await user.click(screen.getByRole("button", { name: "Create" }));

    await waitFor(() =>
      expect(onCreate).toHaveBeenCalledWith({
        name: "Development",
        project: 42,
        visible: true,
        billable: true,
      }),
    );
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("creates a global activity with a custom color", async () => {
    const user = userEvent.setup();
    const { onCreate } = renderDialog();

    await user.click(screen.getByRole("radio", { name: "Global" }));
    await user.type(screen.getByLabelText("Name"), "Meetings");
    await user.click(screen.getByRole("radio", { name: "Custom" }));
    const hex = screen.getByLabelText("Hex color");
    await user.clear(hex);
    await user.type(hex, "ff00aa");
    await user.click(screen.getByRole("button", { name: "Create" }));

    await waitFor(() =>
      expect(onCreate).toHaveBeenCalledWith({
        name: "Meetings",
        color: "#ff00aa",
        visible: true,
        billable: true,
      }),
    );
  });

  it("stays open and explains a permission failure", async () => {
    const onCreate = vi.fn().mockRejectedValue(
      new KimaiApiError(403, "Forbidden", null, "forbidden"),
    );
    const user = userEvent.setup();
    const { onClose } = renderDialog(onCreate);

    await user.type(screen.getByLabelText("Name"), "Blocked");
    await user.click(screen.getByRole("button", { name: "Create" }));

    expect(
      await screen.findByText(/did not allow this activity to be created/i),
    ).toBeTruthy();
    expect(screen.getByRole("dialog", { name: "Create activity" })).toBeTruthy();
    expect(onClose).not.toHaveBeenCalled();
  });

  it.each([
    [
      "an unauthorized response",
      new KimaiApiError(401, "Unauthorized", null, "unauthorized"),
      /unauthorized/i,
    ],
    ["a server message", new Error("Server said no"), /server said no/i],
    ["an unknown failure", null, /could not create the activity/i],
  ])("shows %s without closing", async (_case, failure, message) => {
    const user = userEvent.setup();
    const onCreate = vi.fn().mockRejectedValue(failure);
    const { onClose } = renderDialog(onCreate);

    await user.type(screen.getByLabelText("Name"), "Failed");
    await user.click(screen.getByRole("button", { name: "Create" }));

    expect(await screen.findByText(message)).toBeTruthy();
    expect(onClose).not.toHaveBeenCalled();
  });

  it("validates custom colors and accepts the native color picker", async () => {
    const user = userEvent.setup();
    const { onCreate } = renderDialog();

    await user.type(screen.getByLabelText("Name"), "Color test");
    await user.click(screen.getByRole("radio", { name: "Custom" }));
    fireEvent.change(screen.getByLabelText("Hex color"), {
      target: { value: "invalid" },
    });
    const form = screen.getByRole("dialog").querySelector("form");
    expect(form).toBeTruthy();
    fireEvent.submit(form!);
    expect(onCreate).not.toHaveBeenCalled();

    fireEvent.change(screen.getByLabelText("Choose color"), {
      target: { value: "#112233" },
    });
    expect(screen.getByLabelText("Hex color")).toHaveProperty(
      "value",
      "112233",
    );
    await user.click(screen.getByRole("radio", { name: "Automatic" }));
    expect(screen.queryByLabelText("Hex color")).toBeNull();
  });

  it("traps focus, ignores handled keys and closes on Escape", () => {
    const { onClose } = renderDialog();
    const prevented = new KeyboardEvent("keydown", {
      key: "Escape",
      bubbles: true,
      cancelable: true,
    });
    prevented.preventDefault();
    document.dispatchEvent(prevented);
    expect(onClose).not.toHaveBeenCalled();

    const focusable = Array.from(
      screen.getByRole("dialog").querySelectorAll<HTMLElement>(
        "button:not(:disabled), input:not(:disabled), [tabindex]:not([tabindex='-1'])",
      ),
    );
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    first.focus();
    fireEvent.keyDown(document, { key: "Tab", shiftKey: true });
    expect(document.activeElement).toBe(last);
    fireEvent.keyDown(document, { key: "Tab" });
    expect(document.activeElement).toBe(first);

    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("cannot close while activity creation is pending", async () => {
    let finish!: () => void;
    const onCreate = vi.fn(
      () => new Promise<void>((resolve) => {
        finish = resolve;
      }),
    );
    const user = userEvent.setup();
    const { onClose } = renderDialog(onCreate);

    await user.type(screen.getByLabelText("Name"), "Pending");
    await user.click(screen.getByRole("button", { name: "Create" }));
    expect(screen.getByRole("button", { name: "Creating…" })).toBeTruthy();
    fireEvent.keyDown(document, { key: "Tab" });
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).not.toHaveBeenCalled();

    await act(async () => finish());
    await waitFor(() => expect(onClose).toHaveBeenCalledOnce());
  });
});
