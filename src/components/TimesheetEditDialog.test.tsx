// @vitest-environment jsdom

import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { I18nextProvider } from "react-i18next";
import { KimaiApiError } from "../api/kimaiClient";
import i18n, { initPromise } from "../shared/i18n";
import type { EditTimesheetPayload } from "../hooks/useEditTimesheet";
import type { TodayEntry } from "../types";
import TimesheetEditDialog from "./TimesheetEditDialog";

beforeAll(async () => {
  await initPromise;
  await i18n.changeLanguage("en");
});

afterEach(() => cleanup());

const entry: TodayEntry = {
  id: 42,
  projectId: 1,
  activityId: 2,
  project: "Forest",
  projectColor: "",
  activityColor: "",
  customerColor: "",
  customer: "Customer",
  activity: "Work",
  description: "",
  tags: [],
  billable: true,
  beginIso: "2026-07-22T09:00:00",
  endIso: "2026-07-22T10:00:00",
  duration: 3_600,
  isRunning: false,
};

function renderDialog(
  onSave: (id: number, payload: EditTimesheetPayload) => Promise<unknown>,
) {
  const onClose = vi.fn();
  render(
    <I18nextProvider i18n={i18n}>
      <TimesheetEditDialog entry={entry} onSave={onSave} onClose={onClose} />
    </I18nextProvider>,
  );
  return { onClose };
}

async function changeEndHour(hour: string) {
  const user = userEvent.setup();
  await user.click(screen.getByLabelText("End time"));
  const dialogs = screen.getAllByRole("dialog");
  const picker = dialogs[dialogs.length - 1];
  const [hourInput] = Array.from(picker.querySelectorAll("input"));
  fireEvent.change(hourInput, { target: { value: hour } });
  fireEvent.blur(hourInput);
  fireEvent.keyDown(picker, { key: "Escape" });
}

describe("TimesheetEditDialog", () => {
  it("saves a changed end time and closes only after success", async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    const { onClose } = renderDialog(onSave);

    await changeEndHour("11");
    await userEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() =>
      expect(onSave).toHaveBeenCalledWith(42, {
        end: "2026-07-22T11:00:00",
      }),
    );
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("saves a description without changing times", async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    const { onClose } = renderDialog(onSave);
    expect((screen.getByRole("button", { name: "Save" }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(screen.getByLabelText("Description"), { target: { value: "Finished the report\nReviewed results" } });
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(onSave).toHaveBeenCalledWith(42, {
      description: "Finished the report\nReviewed results",
    }));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("loads and clears the existing description", async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    render(<I18nextProvider i18n={i18n}>
      <TimesheetEditDialog entry={{ ...entry, description: "Original note" }} onSave={onSave} onClose={vi.fn()} />
    </I18nextProvider>);
    const input = screen.getByLabelText("Description");
    expect((input as HTMLTextAreaElement).value).toBe("Original note");
    await userEvent.clear(input);
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(onSave).toHaveBeenCalledWith(42, { description: "" }));
  });

  it("saves description and time changes together", async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    renderDialog(onSave);
    await changeEndHour("11");
    fireEvent.change(screen.getByLabelText("Description"), { target: { value: "Updated note" } });
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(onSave).toHaveBeenCalledWith(42, {
      end: "2026-07-22T11:00:00", description: "Updated note",
    }));
  });

  it("retains a description draft after a permission failure", async () => {
    const onSave = vi.fn().mockRejectedValue(new KimaiApiError(403, "Forbidden", null, "forbidden"));
    const { onClose } = renderDialog(onSave);
    fireEvent.change(screen.getByLabelText("Description"), { target: { value: "Keep my note" } });
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(await screen.findByRole("alert")).toBeTruthy();
    expect((screen.getByLabelText("Description") as HTMLTextAreaElement).value).toBe("Keep my note");
    expect(onClose).not.toHaveBeenCalled();
  });

  it("stays open and explains a Kimai permission failure", async () => {
    const onSave = vi.fn().mockRejectedValue(
      new KimaiApiError(403, "Forbidden", null, "forbidden"),
    );
    const { onClose } = renderDialog(onSave);

    await changeEndHour("11");
    await userEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(
      await screen.findByText(/Kimai did not allow this edit/i),
    ).toBeTruthy();
    expect(screen.getByRole("dialog", { name: "Edit time entry" })).toBeTruthy();
    expect(onClose).not.toHaveBeenCalled();
  });

  it("blocks an end time before the start without calling the API", async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    const { onClose } = renderDialog(onSave);

    await changeEndHour("08");
    await userEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(await screen.findByText(/cannot be before start time/i)).toBeTruthy();
    expect(onSave).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });

  it("loads and clears a configured custom field", async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    const onClose = vi.fn();
    render(
      <I18nextProvider i18n={i18n}>
        <TimesheetEditDialog
          entry={{ ...entry, metadata: { url_link: "https://example.test/34" } }}
          customInputs={[{
            id: "custom-field:url_link",
            metadataName: "url_link",
            label: "URL link",
            labelKey: "",
            placeholder: "https://…",
            placeholderKey: "",
            type: "url",
          }]}
          onSave={onSave}
          onClose={onClose}
        />
      </I18nextProvider>,
    );

    await userEvent.clear(screen.getByLabelText("URL link"));
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(onSave).toHaveBeenCalledWith(42, {
      metadata: { url_link: "" },
    }));
    expect(onClose).toHaveBeenCalledOnce();
  });
});
