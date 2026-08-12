// @vitest-environment jsdom

import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AppSettings } from "../types";

const mocks = vi.hoisted(() => ({
  getCurrentWindow: vi.fn(),
  scaleFactor: vi.fn(),
  onResized: vi.fn(),
  resizeCleanup: vi.fn(),
  resizeListener: undefined as ((event: { payload: { height: number } }) => void) | undefined,
  loadSettings: vi.fn(),
  onSettingsChange: vi.fn(),
  patchSettings: vi.fn(),
  settingsCleanup: vi.fn(),
  settingsListener: undefined as ((settings: AppSettings) => void) | undefined,
  setPopupCornerRadius: vi.fn(),
  setPopupSize: vi.fn(),
  setPopupZoom: vi.fn(),
  setPopupVibrancy: vi.fn(),
  setDisplayMode: vi.fn(),
  setTrayIconSize: vi.fn(),
  setTrayIconShape: vi.fn(),
  addMediaListener: vi.fn(),
  removeMediaListener: vi.fn(),
  mediaListener: undefined as ((event: { matches: boolean }) => void) | undefined,
}));

vi.mock("@tauri-apps/api/window", () => ({
  getCurrentWindow: mocks.getCurrentWindow,
}));
vi.mock("../settings/service", () => ({
  loadSettings: mocks.loadSettings,
  onSettingsChange: mocks.onSettingsChange,
  patchSettings: mocks.patchSettings,
}));
vi.mock("../api/trayApi", () => ({
  setPopupCornerRadius: mocks.setPopupCornerRadius,
  setPopupSize: mocks.setPopupSize,
  setPopupZoom: mocks.setPopupZoom,
  setPopupVibrancy: mocks.setPopupVibrancy,
  setDisplayMode: mocks.setDisplayMode,
  setTrayIconSize: mocks.setTrayIconSize,
  setTrayIconShape: mocks.setTrayIconShape,
}));

import { useAppearance } from "./useAppearance";

function settings(overrides: Partial<AppSettings> = {}): AppSettings {
  return {
    accentStyle: "blue",
    reduceVisualEffects: false,
    uiSize: "default",
    roundedPopupCorners: true,
    theme: "light",
    popupLayout: "classic",
    displayMode: "tray",
    popupHeight: 640,
    trayIconSize: "medium",
    trayIconShape: "dot",
    ...overrides,
  } as AppSettings;
}

describe("appearance synchronization", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    document.documentElement.className = "";
    document.documentElement.dataset.window = "tray-popup";
    mocks.resizeListener = undefined;
    mocks.settingsListener = undefined;
    mocks.mediaListener = undefined;
    mocks.getCurrentWindow.mockReturnValue({
      scaleFactor: mocks.scaleFactor,
      onResized: mocks.onResized,
    });
    mocks.scaleFactor.mockResolvedValue(2);
    mocks.onResized.mockImplementation((listener) => {
      mocks.resizeListener = listener;
      return Promise.resolve(mocks.resizeCleanup);
    });
    mocks.loadSettings.mockResolvedValue(settings());
    mocks.onSettingsChange.mockImplementation((listener) => {
      mocks.settingsListener = listener;
      return Promise.resolve(mocks.settingsCleanup);
    });
    mocks.patchSettings.mockResolvedValue(undefined);
    Object.defineProperty(window, "matchMedia", {
      configurable: true,
      value: vi.fn(() => ({
        matches: true,
        addEventListener: (_event: string, listener: (event: { matches: boolean }) => void) => {
          mocks.mediaListener = listener;
          mocks.addMediaListener();
        },
        removeEventListener: mocks.removeMediaListener,
      })),
    });
  });

  afterEach(() => vi.useRealTimers());

  it("applies tray settings, persists bounded resize and reacts to transparent detached mode", async () => {
    const { unmount } = renderHook(() => useAppearance());

    await waitFor(() => expect(mocks.setPopupSize).toHaveBeenCalledOnce());
    expect(mocks.setPopupSize).toHaveBeenCalledWith(360, 640, 1);
    expect(mocks.setPopupCornerRadius).toHaveBeenCalledWith(10);
    expect(mocks.setPopupVibrancy).toHaveBeenCalledWith(false);
    expect(mocks.setDisplayMode).toHaveBeenCalledWith("tray");
    expect(mocks.setTrayIconSize).toHaveBeenCalledWith("medium");
    expect(mocks.setTrayIconShape).toHaveBeenCalledWith("dot");
    expect(document.documentElement.dataset).toMatchObject({
      accent: "blue",
      reduceMotion: "false",
      uiSize: "default",
      roundedPopup: "true",
      theme: "light",
      layout: "classic",
      displayMode: "tray",
    });
    expect(document.documentElement.classList.contains("dark")).toBe(false);

    act(() => mocks.resizeListener?.({ payload: { height: 100 } }));
    await waitFor(
      () => expect(mocks.patchSettings).toHaveBeenCalledWith({ popupHeight: 320 }),
      { timeout: 1_000 },
    );

    act(() => mocks.resizeListener?.({ payload: { height: 9_999 } }));
    await waitFor(
      () => expect(mocks.patchSettings).toHaveBeenCalledWith({ popupHeight: 1_200 }),
      { timeout: 1_000 },
    );

    const detached = settings({
      accentStyle: "purple",
      reduceVisualEffects: true,
      uiSize: "scale130",
      roundedPopupCorners: false,
      theme: "transparent",
      popupLayout: "focus",
      displayMode: "detached",
      trayIconSize: "large",
      trayIconShape: "square",
    });
    act(() => mocks.settingsListener?.(detached));

    expect(mocks.setPopupZoom).toHaveBeenCalledWith(1.3);
    expect(mocks.setPopupCornerRadius).toHaveBeenLastCalledWith(0);
    expect(mocks.setPopupVibrancy).toHaveBeenLastCalledWith(true);
    expect(mocks.setDisplayMode).toHaveBeenLastCalledWith("detached");
    expect(mocks.setTrayIconSize).toHaveBeenLastCalledWith("large");
    expect(mocks.setTrayIconShape).toHaveBeenLastCalledWith("square");
    expect(document.documentElement.classList.contains("dark")).toBe(true);
    expect(mocks.addMediaListener).toHaveBeenCalledOnce();

    act(() => mocks.mediaListener?.({ matches: false }));
    expect(document.documentElement.classList.contains("dark")).toBe(false);

    const zoomCalls = mocks.setPopupZoom.mock.calls.length;
    act(() => mocks.settingsListener?.(detached));
    expect(mocks.setPopupZoom).toHaveBeenCalledTimes(zoomCalls);
    expect(mocks.removeMediaListener).toHaveBeenCalledOnce();

    unmount();
    await waitFor(() => expect(mocks.settingsCleanup).toHaveBeenCalledOnce());
    expect(mocks.resizeCleanup).toHaveBeenCalledOnce();
    expect(mocks.removeMediaListener).toHaveBeenCalledTimes(2);
  });

  it("applies dark appearance outside the tray without native resize tracking", async () => {
    document.documentElement.dataset.window = "settings";
    mocks.loadSettings.mockResolvedValue(settings({
      theme: "dark",
      popupHeight: 0,
      displayMode: undefined,
      trayIconSize: undefined,
      trayIconShape: undefined,
      uiSize: "small",
    }));
    const { unmount } = renderHook(() => useAppearance());
    await waitFor(() => expect(document.documentElement.classList.contains("dark")).toBe(true));
    expect(mocks.scaleFactor).not.toHaveBeenCalled();
    expect(mocks.setPopupSize).toHaveBeenCalledWith(306, 544, 0.85);
    expect(mocks.setPopupVibrancy).not.toHaveBeenCalled();
    unmount();
    await waitFor(() => expect(mocks.settingsCleanup).toHaveBeenCalled());
  });

  it("ignores irrelevant resize events and debounces the latest height", async () => {
    vi.useFakeTimers();
    const { unmount } = renderHook(() => useAppearance());
    await act(async () => Promise.resolve());
    act(() => mocks.resizeListener?.({ payload: { height: 1_280 } }));
    expect(mocks.patchSettings).not.toHaveBeenCalled();

    act(() => mocks.settingsListener?.(settings({ popupHeight: 600 })));
    act(() => mocks.resizeListener?.({ payload: { height: 1_200 } }));
    expect(mocks.patchSettings).not.toHaveBeenCalled();
    mocks.patchSettings.mockRejectedValueOnce(new Error("disk"));
    act(() => mocks.resizeListener?.({ payload: { height: 1_400 } }));
    act(() => mocks.resizeListener?.({ payload: { height: 1_600 } }));
    await act(async () => vi.advanceTimersByTime(250));
    expect(mocks.patchSettings).toHaveBeenCalledTimes(1);
    expect(mocks.patchSettings).toHaveBeenCalledWith({ popupHeight: 800 });

    act(() => mocks.settingsListener?.(settings({ displayMode: "detached" })));
    act(() => mocks.resizeListener?.({ payload: { height: 2_000 } }));
    expect(mocks.patchSettings).toHaveBeenCalledTimes(1);
    unmount();
  });

  it("cleans up listeners that resolve after unmount and ignores late settings", async () => {
    let resolveResize!: (cleanup: () => void) => void;
    mocks.onResized.mockReturnValueOnce(new Promise((resolve) => { resolveResize = resolve; }));
    let resolveSettings!: (value: AppSettings) => void;
    mocks.loadSettings.mockReturnValueOnce(new Promise((resolve) => { resolveSettings = resolve; }));
    const { unmount } = renderHook(() => useAppearance());
    await act(async () => Promise.resolve());
    unmount();
    await act(async () => {
      resolveResize(mocks.resizeCleanup);
      resolveSettings(settings({ accentStyle: "red" }));
    });
    expect(mocks.resizeCleanup).toHaveBeenCalledTimes(2);
    expect(document.documentElement.dataset.accent).not.toBe("red");
  });
});
