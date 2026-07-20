// @vitest-environment jsdom

import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { I18nextProvider } from "react-i18next";
import i18n, { initPromise } from "../shared/i18n";
import type { ReminderShowRequest } from "../api/reminderWindow";
import {
  REMINDER_RENDERED_EVENT,
  REMINDER_SHOW_EVENT,
} from "../api/reminderWindow";
import TimerReminder from "./TimerReminder";

const mocks = vi.hoisted(() => ({
  emitTo: vi.fn(),
  hide: vi.fn(),
  listen: vi.fn(),
  unlisten: vi.fn(),
}));

let receiveReminder: ((event: { payload: ReminderShowRequest }) => void) | undefined;

vi.mock("@tauri-apps/api/event", () => ({ emitTo: mocks.emitTo }));
vi.mock("@tauri-apps/api/window", () => ({
  getCurrentWindow: () => ({
    label: "timer-reminder",
    hide: mocks.hide,
    listen: mocks.listen,
  }),
}));
vi.mock("../hooks/useLanguageSync", () => ({ useLanguageSync: vi.fn() }));
vi.mock("../settings/service", () => ({
  defaultSettings: { noTimerReminderMinutes: 30 },
  loadSettings: () =>
    Promise.resolve({
      language: "en",
      noTimerReminderMinutes: 30,
      accentStyle: "blue",
      reduceVisualEffects: false,
      theme: "dark",
    }),
  onSettingsChange: () => Promise.resolve(mocks.unlisten),
}));
vi.mock("../utils/logger", () => ({
  logger: { error: vi.fn() },
}));

beforeAll(async () => {
  await initPromise;
  await i18n.changeLanguage("en");
});

beforeEach(() => {
  receiveReminder = undefined;
  vi.clearAllMocks();
  mocks.emitTo.mockResolvedValue(undefined);
  mocks.listen.mockImplementation(async (event, handler) => {
    if (event === REMINDER_SHOW_EVENT) receiveReminder = handler;
    return mocks.unlisten;
  });
});

afterEach(() => cleanup());

describe("timer reminder window", () => {
  it("commits each reminder before acknowledging it and removes the previous one", () => {
    const renderedKinds: string[] = [];
    mocks.emitTo.mockImplementation(async (_target, event) => {
      if (event !== REMINDER_RENDERED_EVENT) return;
      renderedKinds.push(
        document.querySelector("#idle-reminder-title")
          ? "idle"
          : document.querySelector("#timer-reminder-title")
            ? "timer"
            : "none",
      );
    });

    render(
      <I18nextProvider i18n={i18n}>
        <TimerReminder />
      </I18nextProvider>,
    );

    expect(screen.queryByRole("alertdialog")).toBeNull();

    act(() => {
      receiveReminder?.({
        payload: {
          requestId: "idle-request",
          replyTo: "settings",
          payload: {
            kind: "idle",
            test: true,
            idleStartedAtIso: "2026-01-01T12:00:00.000Z",
            idleDurationSeconds: 300,
            project: "Project",
            activity: "Activity",
            processing: false,
            error: null,
          },
        },
      });
    });
    expect(screen.getByRole("alertdialog")).not.toBeNull();
    expect(document.querySelector("#idle-reminder-title")).not.toBeNull();
    expect(renderedKinds).toEqual(["idle"]);

    act(() => {
      receiveReminder?.({
        payload: {
          requestId: "timer-request",
          replyTo: "settings",
          payload: { kind: "timer" },
        },
      });
    });
    expect(document.querySelector("#idle-reminder-title")).toBeNull();
    expect(document.querySelector("#timer-reminder-title")).not.toBeNull();
    expect(renderedKinds).toEqual(["idle", "timer"]);
  });
});
