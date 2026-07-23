// @vitest-environment jsdom

import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { I18nextProvider } from "react-i18next";
import i18n, { initPromise } from "../shared/i18n";
import ActiveTimerCard from "./ActiveTimerCard";

vi.mock("@tauri-apps/api/window", () => ({
  getCurrentWindow: () => ({
    listen: vi.fn(async () => () => {}),
  }),
}));

beforeAll(async () => {
  await initPromise;
  await i18n.changeLanguage("en");
});

afterEach(() => cleanup());

describe("ActiveTimerCard keyboard actions", () => {
  it("opens and saves the note editor from a shortcut request in compact mode", async () => {
    const user = userEvent.setup();
    const onEdit = vi.fn();
    const onHandled = vi.fn();
    render(
      <I18nextProvider i18n={i18n}>
        <ActiveTimerCard
          timer={{
            id: 1,
            projectId: 2,
            activityId: 3,
            project: "Alpha",
            projectColor: "#000000",
            activityColor: "#000000",
            customerColor: "#000000",
            activity: "Work",
            description: "Old note",
            tags: [],
            beginSeconds: Math.floor(Date.now() / 1000),
            beginIso: new Date().toISOString(),
          }}
          onStop={vi.fn()}
          onEdit={onEdit}
          compact
          editDescriptionRequest={1}
          onEditDescriptionRequestHandled={onHandled}
        />
      </I18nextProvider>,
    );

    const input = await screen.findByRole("textbox");
    expect(document.activeElement).toBe(input);
    await user.clear(input);
    await user.type(input, "New note{Enter}");

    expect(onEdit).toHaveBeenCalledWith(1, { description: "New note" });
    expect(onHandled).toHaveBeenCalledOnce();
  });

  it("adds the current session to time already spent on the linked issue", () => {
    const nowSeconds = Math.floor(Date.now() / 1000);

    render(
      <I18nextProvider i18n={i18n}>
        <ActiveTimerCard
          timer={{
            id: 2,
            projectId: 2,
            activityId: 3,
            project: "Alpha",
            projectColor: "#000000",
            activityColor: "#000000",
            customerColor: "#000000",
            activity: "Work",
            description: "",
            tags: [],
            beginSeconds: nowSeconds - 300,
            beginIso: new Date((nowSeconds - 300) * 1000).toISOString(),
          }}
          onStop={vi.fn()}
          timeEstimate={7_200}
          timeSpent={3_600}
        />
      </I18nextProvider>,
    );

    expect(screen.getByText("1h5m / 2h")).toBeTruthy();
  });
});
