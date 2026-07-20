import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  emitTo: vi.fn(),
  getCurrentWindow: vi.fn(),
  getByLabel: vi.fn(),
  currentPlatform: vi.fn(),
  listen: vi.fn(),
  unlisten: vi.fn(),
  setSimpleFullscreen: vi.fn(),
  show: vi.fn(),
  setFocus: vi.fn(),
  hide: vi.fn(),
}));

vi.mock("@tauri-apps/api/event", () => ({ emitTo: mocks.emitTo }));
vi.mock("@tauri-apps/api/window", () => ({
  getCurrentWindow: mocks.getCurrentWindow,
  Window: { getByLabel: mocks.getByLabel },
}));
vi.mock("../platform", () => ({ currentPlatform: mocks.currentPlatform }));

import {
  hideFullscreenReminder,
  REMINDER_RENDERED_EVENT,
  REMINDER_SHOW_EVENT,
  REMINDER_WINDOW_LABEL,
  showFullscreenReminder,
  updateFullscreenReminder,
} from "./reminderWindow";

let acknowledgeRender:
  | ((event: { payload: { requestId: string } }) => void)
  | undefined;

describe("fullscreen reminder window bridge", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.currentPlatform.mockReturnValue({ os: "windows", session: "native" });
    acknowledgeRender = undefined;
    mocks.listen.mockImplementation(async (_event, handler) => {
      acknowledgeRender = handler;
      return mocks.unlisten;
    });
    mocks.getCurrentWindow.mockReturnValue({
      label: "settings",
      listen: mocks.listen,
    });
    mocks.emitTo.mockImplementation(async (_target, event, request) => {
      if (event === REMINDER_SHOW_EVENT) {
        acknowledgeRender?.({ payload: { requestId: request.requestId } });
      }
    });
    mocks.setSimpleFullscreen.mockResolvedValue(undefined);
    mocks.show.mockResolvedValue(undefined);
    mocks.setFocus.mockResolvedValue(undefined);
    mocks.hide.mockResolvedValue(undefined);
    mocks.getByLabel.mockResolvedValue({
      setSimpleFullscreen: mocks.setSimpleFullscreen,
      show: mocks.show,
      setFocus: mocks.setFocus,
      hide: mocks.hide,
    });
  });

  it("sends content before opening and focusing the shared window", async () => {
    const payload = { kind: "timer" } as const;

    await expect(showFullscreenReminder(payload)).resolves.toBe(true);

    expect(mocks.listen).toHaveBeenCalledWith(
      REMINDER_RENDERED_EVENT,
      expect.any(Function),
    );
    expect(mocks.emitTo).toHaveBeenCalledWith(
      REMINDER_WINDOW_LABEL,
      REMINDER_SHOW_EVENT,
      expect.objectContaining({
        requestId: expect.any(String),
        replyTo: "settings",
        payload,
      }),
    );
    expect(mocks.unlisten).toHaveBeenCalledOnce();
    expect(mocks.setSimpleFullscreen).toHaveBeenCalledTimes(2);
    expect(mocks.setSimpleFullscreen).toHaveBeenNthCalledWith(1, true);
    expect(mocks.setSimpleFullscreen).toHaveBeenNthCalledWith(2, true);
    expect(mocks.show).toHaveBeenCalledOnce();
    expect(mocks.setFocus).toHaveBeenCalledOnce();
    expect(mocks.emitTo.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.show.mock.invocationCallOrder[0],
    );
    expect(mocks.setSimpleFullscreen.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.show.mock.invocationCallOrder[0],
    );
    expect(mocks.show.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.setSimpleFullscreen.mock.invocationCallOrder[1],
    );
  });

  it("updates visible content without reopening the window", async () => {
    const payload = {
      kind: "idle",
      test: true,
      idleStartedAtIso: "2026-01-01T12:00:00.000Z",
      idleDurationSeconds: 300,
      project: "Project",
      activity: "Activity",
      processing: false,
      error: null,
    } as const;

    await updateFullscreenReminder(payload);

    expect(mocks.emitTo).toHaveBeenCalledWith(
      REMINDER_WINDOW_LABEL,
      REMINDER_SHOW_EVENT,
      expect.objectContaining({ payload }),
    );
    expect(mocks.show).not.toHaveBeenCalled();
  });

  it("renders after mapping the replacement fullscreen surface on Linux X11", async () => {
    mocks.currentPlatform.mockReturnValue({ os: "linux", session: "x11" });

    await expect(showFullscreenReminder({ kind: "timer" })).resolves.toBe(true);

    expect(mocks.show).toHaveBeenCalledOnce();
    expect(mocks.setSimpleFullscreen).toHaveBeenCalledTimes(2);
    expect(mocks.emitTo).toHaveBeenCalledOnce();
    expect(mocks.show.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.emitTo.mock.invocationCallOrder[0],
    );
  });

  it("hides the shared window when it exists", async () => {
    await hideFullscreenReminder();
    expect(mocks.hide).toHaveBeenCalledOnce();
    expect(mocks.setSimpleFullscreen).not.toHaveBeenCalledWith(false);
  });

  it("disposes the fullscreen surface before hiding on Linux X11", async () => {
    mocks.currentPlatform.mockReturnValue({ os: "linux", session: "x11" });

    await hideFullscreenReminder();

    expect(mocks.setSimpleFullscreen).toHaveBeenCalledWith(false);
    expect(mocks.setSimpleFullscreen.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.hide.mock.invocationCallOrder[0],
    );
  });
});
