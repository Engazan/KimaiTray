import { beforeEach, describe, expect, it, vi } from "vitest";

const core = vi.hoisted(() => ({ invoke: vi.fn() }));
vi.mock("@tauri-apps/api/core", () => core);

import {
  listMonitors,
  openKimaiInBrowser,
  registerShortcuts,
  setAlwaysOnTop,
  setDisplayMode,
  setPopupCornerRadius,
  setPopupMonitor,
  setPopupSize,
  setPopupVibrancy,
  setPopupZoom,
  setTrayClickActions,
  setTrayColors,
  setTrayIcon,
  setTrayIconShape,
  setTrayIconSize,
  setTrayTitle,
  setTrayTooltip,
  startTrayTicker,
  stopTrayTicker,
  updateTrayMenu,
} from "./trayApi";

describe("tray API", () => {
  beforeEach(() => vi.resetAllMocks());

  it("opens the configured Kimai URL through the native tray command", async () => {
    core.invoke.mockResolvedValue(undefined);

    await expect(openKimaiInBrowser()).resolves.toBeUndefined();

    expect(core.invoke).toHaveBeenCalledWith("open_kimai_in_browser");
  });

  it.each([
    ["tooltip", () => setTrayTooltip("Working"), "set_tray_tooltip", { text: "Working" }],
    ["title", () => setTrayTitle("01:23"), "set_tray_title", { title: "01:23" }],
    [
      "ticker",
      () => startTrayTicker(123, "Project", "Activity", "timer", true),
      "start_tray_ticker",
      {
        beginSeconds: 123,
        project: "Project",
        activity: "Activity",
        labelStyle: "timer",
        showSeconds: true,
      },
    ],
    ["ticker stop", () => stopTrayTicker(), "stop_tray_ticker", undefined],
    ["icon state", () => setTrayIcon("running"), "set_tray_icon", { state: "running" }],
    ["icon size", () => setTrayIconSize("large"), "set_tray_icon_size", { size: "large" }],
    ["icon shape", () => setTrayIconShape("clock"), "set_tray_icon_shape", { shape: "clock" }],
    [
      "colors",
      () => setTrayColors({ idle: "#1", running: "#2", paused: "#3", error: "#4" }),
      "set_tray_colors",
      { idle: "#1", running: "#2", paused: "#3", error: "#4" },
    ],
    ["vibrancy", () => setPopupVibrancy(true), "set_popup_vibrancy", { enabled: true }],
    ["popup size", () => setPopupSize(400, 700, 1.3), "set_popup_size", { width: 400, height: 700, zoom: 1.3 }],
    ["popup zoom", () => setPopupZoom(1.45), "set_popup_zoom", { zoom: 1.45 }],
    ["corner radius", () => setPopupCornerRadius(12), "set_popup_corner_radius", { radius: 12 }],
    ["display mode", () => setDisplayMode("detached"), "set_display_mode", { mode: "detached" }],
    ["always on top", () => setAlwaysOnTop(true), "set_always_on_top", { pinned: true }],
    ["click actions", () => setTrayClickActions("popup", "menu"), "set_tray_click_actions", { leftAction: "popup", rightAction: "menu" }],
    ["popup monitor", () => setPopupMonitor("specific", 2, "center"), "set_popup_monitor", { mode: "specific", index: 2, position: "center" }],
    [
      "menu labels",
      () =>
        updateTrayMenu({
          toggleLabel: "Toggle",
          settingsLabel: "Settings",
          openKimaiLabel: "Kimai",
          refreshLabel: "Refresh",
          quitLabel: "Quit",
        }),
      "update_tray_menu",
      {
        toggleLabel: "Toggle",
        settingsLabel: "Settings",
        openKimaiLabel: "Kimai",
        refreshLabel: "Refresh",
        quitLabel: "Quit",
      },
    ],
  ])("forwards the %s contract to its native command", async (_name, call, command, args) => {
    core.invoke.mockResolvedValue(undefined);

    await expect(call()).resolves.toBeUndefined();
    if (args === undefined) {
      expect(core.invoke).toHaveBeenCalledWith(command);
    } else {
      expect(core.invoke).toHaveBeenCalledWith(command, args);
    }
  });

  it("registers the complete shortcut set as one validated request", async () => {
    const shortcuts = {
      togglePopup: "Cmd+K",
      startStopTimer: "Cmd+T",
      newTask: "Cmd+N",
      pauseResume: "Cmd+P",
      continueLastTask: "Cmd+C",
      editNote: "Cmd+E",
      openKimai: "Cmd+O",
      openSettings: "Cmd+,",
    };

    await registerShortcuts(shortcuts);
    expect(core.invoke).toHaveBeenCalledWith("register_shortcuts", {
      request: shortcuts,
    });
  });

  it("returns native monitor data and falls back to an empty list", async () => {
    const monitors = [{ index: 0, name: "Main", primary: true }];
    core.invoke.mockResolvedValueOnce(monitors).mockRejectedValueOnce(new Error("unavailable"));

    await expect(listMonitors()).resolves.toEqual(monitors);
    await expect(listMonitors()).resolves.toEqual([]);
  });

  it("swallows failures for best-effort visual updates", async () => {
    core.invoke.mockRejectedValue(new Error("window unavailable"));

    await expect(setTrayTooltip("Working")).resolves.toBeUndefined();
    await expect(setPopupSize(400, 700, 1)).resolves.toBeUndefined();
    await expect(setDisplayMode("tray")).resolves.toBeUndefined();
  });

  it("propagates failures for commands callers must handle", async () => {
    core.invoke.mockRejectedValue(new Error("native failure"));
    const shortcuts = {
      togglePopup: "",
      startStopTimer: "",
      newTask: "",
      pauseResume: "",
      continueLastTask: "",
      editNote: "",
      openKimai: "",
      openSettings: "",
    };

    await expect(openKimaiInBrowser()).rejects.toThrow("native failure");
    await expect(registerShortcuts(shortcuts)).rejects.toThrow("native failure");
  });
});
