import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  emitTo: vi.fn(),
  getByLabel: vi.fn(),
  setFullscreen: vi.fn(),
  show: vi.fn(),
  setFocus: vi.fn(),
  hide: vi.fn(),
}));

vi.mock("@tauri-apps/api/event", () => ({ emitTo: mocks.emitTo }));
vi.mock("@tauri-apps/api/window", () => ({
  Window: { getByLabel: mocks.getByLabel },
}));

import {
  hideFullscreenReminder,
  REMINDER_SHOW_EVENT,
  REMINDER_WINDOW_LABEL,
  showFullscreenReminder,
  updateFullscreenReminder,
} from "./reminderWindow";

describe("fullscreen reminder window bridge", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.emitTo.mockResolvedValue(undefined);
    mocks.setFullscreen.mockResolvedValue(undefined);
    mocks.show.mockResolvedValue(undefined);
    mocks.setFocus.mockResolvedValue(undefined);
    mocks.hide.mockResolvedValue(undefined);
    mocks.getByLabel.mockResolvedValue({
      setFullscreen: mocks.setFullscreen,
      show: mocks.show,
      setFocus: mocks.setFocus,
      hide: mocks.hide,
    });
  });

  it("sends content before opening and focusing the shared window", async () => {
    const payload = { kind: "timer" } as const;

    await expect(showFullscreenReminder(payload)).resolves.toBe(true);

    expect(mocks.emitTo).toHaveBeenCalledWith(
      REMINDER_WINDOW_LABEL,
      REMINDER_SHOW_EVENT,
      payload,
    );
    expect(mocks.setFullscreen).toHaveBeenCalledWith(true);
    expect(mocks.show).toHaveBeenCalledOnce();
    expect(mocks.setFocus).toHaveBeenCalledOnce();
    expect(mocks.emitTo.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.show.mock.invocationCallOrder[0],
    );
    expect(mocks.show.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.setFullscreen.mock.invocationCallOrder[0],
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
      payload,
    );
    expect(mocks.show).not.toHaveBeenCalled();
  });

  it("hides the shared window when it exists", async () => {
    await hideFullscreenReminder();
    expect(mocks.hide).toHaveBeenCalledOnce();
  });
});
