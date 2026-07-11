// @vitest-environment jsdom

import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { I18nextProvider } from "react-i18next";
import i18n, { initPromise } from "../shared/i18n";
import SearchableSelect from "./SearchableSelect";
import ApiErrorDialog from "./ApiErrorDialog";

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
});
