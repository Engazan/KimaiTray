// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { I18nextProvider } from "react-i18next";
import i18n, { initPromise } from "../shared/i18n";
import type { ReminderShowRequest } from "../api/reminderWindow";
import {
  IDLE_REMINDER_ACTION_EVENT,
  REMINDER_RENDERED_EVENT,
  REMINDER_SHOW_EVENT,
} from "../api/reminderWindow";
import TimerReminder from "./TimerReminder";

const mocks = vi.hoisted(() => ({
  emitTo: vi.fn(),
  hide: vi.fn(),
  listen: vi.fn(),
  setSimpleFullscreen: vi.fn(),
  unlisten: vi.fn(),
  currentPlatform: vi.fn(),
  loadSettings: vi.fn(),
  onSettingsChange: vi.fn(),
  settingsCallback: null as null | ((settings: any) => void),
  loggerError: vi.fn(),
}));

let receiveReminder: ((event: { payload: ReminderShowRequest }) => void) | undefined;

vi.mock("@tauri-apps/api/event", () => ({ emitTo: mocks.emitTo }));
vi.mock("@tauri-apps/api/window", () => ({
  getCurrentWindow: () => ({
    label: "timer-reminder",
    hide: mocks.hide,
    listen: mocks.listen,
    setSimpleFullscreen: mocks.setSimpleFullscreen,
  }),
}));
vi.mock("../platform", () => ({ currentPlatform: mocks.currentPlatform }));
vi.mock("../hooks/useLanguageSync", () => ({ useLanguageSync: vi.fn() }));
vi.mock("../settings/service", () => ({
  defaultSettings: { noTimerReminderMinutes: 30 },
  loadSettings: mocks.loadSettings,
  onSettingsChange: mocks.onSettingsChange,
}));
vi.mock("../utils/logger", () => ({
  logger: { error: mocks.loggerError },
}));

beforeAll(async () => {
  await initPromise;
  await i18n.changeLanguage("en");
});

beforeEach(() => {
  receiveReminder = undefined;
  vi.clearAllMocks();
  mocks.emitTo.mockResolvedValue(undefined);
  mocks.hide.mockResolvedValue(undefined);
  mocks.setSimpleFullscreen.mockResolvedValue(undefined);
  mocks.currentPlatform.mockReturnValue({ os: "windows", session: "native" });
  mocks.loadSettings.mockResolvedValue({
    language: "en",
    noTimerReminderMinutes: 30,
    accentStyle: "blue",
    reduceVisualEffects: false,
    theme: "dark",
  });
  mocks.onSettingsChange.mockImplementation(async (callback) => {
    mocks.settingsCallback = callback;
    return mocks.unlisten;
  });
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

  it("restores macOS presentation options after dismissing the reminder", async () => {
    mocks.currentPlatform.mockReturnValue({ os: "macos", session: "native" });
    render(
      <I18nextProvider i18n={i18n}>
        <TimerReminder />
      </I18nextProvider>,
    );

    act(() => {
      receiveReminder?.({
        payload: {
          requestId: "timer-request",
          replyTo: "settings",
          payload: { kind: "timer" },
        },
      });
    });
    fireEvent.click(screen.getByRole("button"));

    await waitFor(() => {
      expect(mocks.setSimpleFullscreen).toHaveBeenCalledWith(false);
    });
    expect(mocks.hide.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.setSimpleFullscreen.mock.invocationCallOrder[0],
    );
  });

  it("exits fullscreen before hiding on Linux X11 and only hides elsewhere", async () => {
    mocks.currentPlatform.mockReturnValue({ os: "linux", session: "x11" });
    const { unmount } = render(<I18nextProvider i18n={i18n}><TimerReminder /></I18nextProvider>);
    act(() => receiveReminder?.({ payload: { requestId: "timer", replyTo: "settings", payload: { kind: "timer" } } }));
    fireEvent.click(screen.getByRole("button"));
    await waitFor(() => expect(mocks.hide).toHaveBeenCalled());
    expect(mocks.setSimpleFullscreen.mock.invocationCallOrder[0]).toBeLessThan(mocks.hide.mock.invocationCallOrder[0]);
    unmount();
    await Promise.resolve();
    expect(mocks.unlisten).toHaveBeenCalled();

    mocks.currentPlatform.mockReturnValue({ os: "windows", session: "native" });
    render(<I18nextProvider i18n={i18n}><TimerReminder /></I18nextProvider>);
    act(() => receiveReminder?.({ payload: { requestId: "timer", replyTo: "settings", payload: { kind: "timer" } } }));
    fireEvent.keyDown(document, { key: "Escape" });
    await waitFor(() => expect(mocks.hide).toHaveBeenCalledTimes(2));
    expect(mocks.setSimpleFullscreen).toHaveBeenCalledTimes(1);
  });

  it("applies loaded and live appearance settings including transparent dark mode", async () => {
    vi.stubGlobal("matchMedia", vi.fn(() => ({ matches: true })));
    mocks.loadSettings.mockResolvedValue({ noTimerReminderMinutes: 12, accentStyle: "red", reduceVisualEffects: true, theme: "transparent" });
    render(<I18nextProvider i18n={i18n}><TimerReminder /></I18nextProvider>);
    await waitFor(() => expect(document.documentElement.dataset.accent).toBe("red"));
    expect(document.documentElement.classList.contains("dark")).toBe(true);
    act(() => mocks.settingsCallback?.({ noTimerReminderMinutes: 7, accentStyle: "green", reduceVisualEffects: false, theme: "light" }));
    expect(document.documentElement.dataset.accent).toBe("green");
    expect(document.documentElement.classList.contains("dark")).toBe(false);
    vi.unstubAllGlobals();
  });

  it("logs reminder acknowledgement failures", async () => {
    mocks.emitTo.mockRejectedValue(new Error("ack"));
    render(<I18nextProvider i18n={i18n}><TimerReminder /></I18nextProvider>);
    act(() => receiveReminder?.({ payload: { requestId: "timer", replyTo: "settings", payload: { kind: "timer" } } }));
    await waitFor(() => expect(mocks.loggerError).toHaveBeenCalledWith(expect.stringContaining("acknowledge")));
  });

  it("sends every idle action and formats hours, minutes and seconds", async () => {
    render(<I18nextProvider i18n={i18n}><TimerReminder /></I18nextProvider>);
    const idlePayload = {
      requestId: "idle", replyTo: "settings",
      payload: { kind: "idle" as const, test: false, idleStartedAtIso: "2026-01-01T12:00:00.000Z", idleDurationSeconds: 3_661, project: "Project", activity: "Activity", processing: false, error: null },
    };
    act(() => receiveReminder?.({ payload: idlePayload }));
    expect(screen.getByText(/1h 1m/)).toBeTruthy();
    const expectedActions = ["continue", "stop-at-start", "stop-now", "stop-and-new"];
    for (const [index, action] of expectedActions.entries()) {
      fireEvent.click(screen.getAllByRole("button")[index]);
      await waitFor(() => expect(mocks.emitTo).toHaveBeenCalledWith(
        "tray-popup",
        IDLE_REMINDER_ACTION_EVENT,
        { action },
      ));
      act(() => receiveReminder?.({ payload: idlePayload }));
    }

    act(() => receiveReminder?.({ payload: { ...idlePayload, payload: { ...idlePayload.payload, idleDurationSeconds: 120, processing: true, error: "failed" } } }));
    expect(screen.getByText(/2 min/)).toBeTruthy();
    expect(screen.getByRole("alert").textContent).toBe("failed");
    expect(screen.getAllByRole("button").every((button) => (button as HTMLButtonElement).disabled)).toBe(true);
    act(() => receiveReminder?.({ payload: { ...idlePayload, payload: { ...idlePayload.payload, idleDurationSeconds: 5, test: true } } }));
    expect(screen.getByText(/5s/)).toBeTruthy();
  });

  it("restores idle controls and shows an error when action delivery fails", async () => {
    mocks.emitTo.mockImplementation(async (_target, event) => {
      if (event === IDLE_REMINDER_ACTION_EVENT) throw new Error("send");
    });
    render(<I18nextProvider i18n={i18n}><TimerReminder /></I18nextProvider>);
    act(() => receiveReminder?.({ payload: { requestId: "idle", replyTo: "settings", payload: { kind: "idle", test: false, idleStartedAtIso: "2026-01-01T12:00:00.000Z", idleDurationSeconds: 60, project: "P", activity: "A", processing: false, error: null } } }));
    fireEvent.keyDown(document, { key: "Escape" });
    expect(await screen.findByRole("alert")).toBeTruthy();
    expect(mocks.loggerError).toHaveBeenCalledWith(expect.stringContaining("Failed to send"));
    expect(screen.getAllByRole("button").some((button) => !(button as HTMLButtonElement).disabled)).toBe(true);
    fireEvent.keyDown(document, { key: "ArrowDown" });
    expect(screen.getByRole("alertdialog")).toBeTruthy();
  });
});
