// @vitest-environment jsdom

import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useTraySystemEvents } from "./useTraySystemEvents";

const native = vi.hoisted(() => ({ listen: vi.fn(), registerShortcuts: vi.fn() }));
vi.mock("@tauri-apps/api/window", () => ({
  getCurrentWindow: () => ({ listen: native.listen }),
}));
vi.mock("../api/trayApi", () => ({ registerShortcuts: native.registerShortcuts }));

describe("tray system event lifecycle", () => {
  it("uses current commands and settings, then cleans up even late listener registrations", async () => {
    const handlers = new Map<string, () => void>();
    const registrations: Array<{ finish: () => void; unlisten: ReturnType<typeof vi.fn> }> = [];
    native.listen.mockImplementation((name: string, handler: () => void) => {
      handlers.set(name, handler);
      const unlisten = vi.fn();
      return new Promise<() => void>((resolve) => {
        registrations.push({ finish: () => resolve(unlisten), unlisten });
      });
    });
    native.registerShortcuts.mockResolvedValue(undefined);
    const initial = {
      shortcutSettings: {
        shortcutTogglePopup: "", shortcutStartStopTimer: "", shortcutNewTask: "",
        shortcutPauseResume: "", shortcutContinueLastTask: "", shortcutEditNote: "",
        shortcutOpenKimai: "", shortcutOpenSettings: "",
      },
      stopTimerOnScreensaver: false,
      stopTimerOnScreenLock: false,
      stopTimer: vi.fn(), pauseResume: vi.fn(), continueLastTask: vi.fn(),
      editNote: vi.fn(), newTask: vi.fn(), refresh: vi.fn(),
    };
    const { rerender, unmount } = renderHook(useTraySystemEvents, { initialProps: initial });
    const registrationCount = native.listen.mock.calls.length;
    const updated = { ...initial, stopTimer: vi.fn(), stopTimerOnScreenLock: true };
    rerender(updated);

    act(() => {
      handlers.get("kimai://toggle-timer")!();
      handlers.get("kimai://screen-locked")!();
      handlers.get("kimai://screensaver-started")!();
    });
    expect(initial.stopTimer).not.toHaveBeenCalled();
    expect(updated.stopTimer).toHaveBeenCalledTimes(2);
    expect(native.listen).toHaveBeenCalledTimes(registrationCount);

    unmount();
    await act(async () => { registrations.forEach(({ finish }) => finish()); });
    for (const { unlisten } of registrations) expect(unlisten).toHaveBeenCalledOnce();
  });
});
