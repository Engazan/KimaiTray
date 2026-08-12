// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import AppearanceSection from "./AppearanceSection";
import ColorPicker from "./ColorPicker";
import TrayWindowSection from "./TrayWindowSection";
import { defaultSettings } from "./service";

const mocks = vi.hoisted(() => ({
  platform: {
    os: "linux",
    supportsWindowPositioning: true,
    supportsTrayClickActions: true,
  },
  setTrayClickActions: vi.fn(),
  setDisplayMode: vi.fn(),
  listMonitors: vi.fn(),
  setPopupMonitor: vi.fn(),
  setTrayIconSize: vi.fn(),
  setTrayIconShape: vi.fn(),
  setTrayColors: vi.fn(),
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));
vi.mock("../platform", () => ({ usePlatform: () => ({ ...mocks.platform }) }));
vi.mock("../api/trayApi", () => ({
  setTrayClickActions: mocks.setTrayClickActions,
  setDisplayMode: mocks.setDisplayMode,
  listMonitors: mocks.listMonitors,
  setPopupMonitor: mocks.setPopupMonitor,
  setTrayIconSize: mocks.setTrayIconSize,
  setTrayIconShape: mocks.setTrayIconShape,
  setTrayColors: mocks.setTrayColors,
}));

beforeEach(() => {
  vi.clearAllMocks();
  Object.assign(mocks.platform, { os: "linux", supportsWindowPositioning: true, supportsTrayClickActions: true });
  mocks.listMonitors.mockResolvedValue([
    { index: 0, name: "Built-in", primary: true },
    { index: 1, name: "External", primary: false },
  ]);
});
afterEach(cleanup);

describe("AppearanceSection", () => {
  it("updates every visual preference family", async () => {
    const user = userEvent.setup();
    const update = vi.fn();
    render(<AppearanceSection settings={{ ...defaultSettings, theme: "light", popupLayout: "classic" }} update={update} />);

    await user.click(screen.getByRole("button", { name: "appearanceSettings.dark" }));
    await user.click(screen.getByRole("button", { name: /appearanceSettings.layoutFocus/ }));
    await user.click(screen.getByRole("button", { name: /appearanceSettings.layoutTaskbar/ }));
    await user.click(screen.getByRole("button", { name: /appearanceSettings.layoutTimeline/ }));
    fireEvent.change(screen.getByRole("slider", { name: "appearanceSettings.uiSize" }), { target: { value: "5" } });
    for (const toggle of screen.getAllByRole("switch")) await user.click(toggle);
    await user.click(screen.getByTitle("purple"));
    await user.click(screen.getByRole("button", { name: "appearanceSettings.colorModeActivityProject" }));

    expect(update).toHaveBeenCalledWith("theme", "dark");
    expect(update).toHaveBeenCalledWith("popupLayout", "focus");
    expect(update).toHaveBeenCalledWith("popupLayout", "taskbar");
    expect(update).toHaveBeenCalledWith("popupLayout", "timeline");
    expect(update).toHaveBeenCalledWith("uiSize", "scale160");
    expect(update).toHaveBeenCalledWith("roundedPopupCorners", false);
    expect(update).toHaveBeenCalledWith("reduceVisualEffects", true);
    expect(update).toHaveBeenCalledWith("accentStyle", "purple");
    expect(update).toHaveBeenCalledWith("colorMode", "activity-project");
  });

  it("falls back to the first size for unknown persisted values", () => {
    render(<AppearanceSection settings={{ ...defaultSettings, uiSize: "unknown" as never, theme: "transparent" }} update={vi.fn()} />);
    expect(screen.getByRole("slider").getAttribute("aria-valuetext")).toContain("85%");
  });
});

describe("ColorPicker", () => {
  it("chooses presets and native colors and normalizes typed hex", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<ColorPicker value="#aabbcc" presets={["#aabbcc", "#ef4444"]} align="start" ariaLabel="Color" onChange={onChange}><span>swatch</span></ColorPicker>);
    await user.click(screen.getByRole("button", { name: "Color" }));
    expect(screen.getByRole("dialog")).toBeTruthy();
    await user.click(screen.getByTitle("#ef4444"));
    expect(onChange).toHaveBeenCalledWith("#ef4444");

    const text = screen.getByRole("textbox");
    fireEvent.change(text, { target: { value: "abc" } });
    expect(onChange).toHaveBeenCalledWith("#aabbcc");
    fireEvent.change(text, { target: { value: "bad value" } });
    fireEvent.blur(text);
    expect((text as HTMLInputElement).value).toBe("aabbcc");
    fireEvent.change(document.querySelector('input[type="color"]')!, { target: { value: "#123456" } });
    expect(onChange).toHaveBeenCalledWith("#123456");
  });

  it("closes on Escape, outside click and trigger toggle, and supports end alignment", async () => {
    const user = userEvent.setup();
    const { rerender } = render(<ColorPicker value="#ffffff" align="end" onChange={vi.fn()}><span>open</span></ColorPicker>);
    await user.click(screen.getByRole("button", { name: "open" }));
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
    await user.click(screen.getByRole("button", { name: "open" }));
    fireEvent.mouseDown(document.body);
    expect(screen.queryByRole("dialog")).toBeNull();
    rerender(<ColorPicker value="#ffffff" onChange={vi.fn()}><span>open</span></ColorPicker>);
    await user.click(screen.getByRole("button", { name: "open" }));
    await user.click(screen.getByRole("button", { name: "open" }));
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});

describe("TrayWindowSection", () => {
  it("configures tray visuals, Linux monitor placement and click actions", async () => {
    const user = userEvent.setup();
    const update = vi.fn();
    render(<TrayWindowSection settings={{
      ...defaultSettings,
      trayIconShape: "square",
      trayColors: { ...defaultSettings.trayColors, running: "invalid" },
      popupMonitorMode: "specific",
    }} update={update} />);

    await waitFor(() => expect(mocks.listMonitors).toHaveBeenCalled());
    await user.click(screen.getByRole("button", { name: "traySettings.iconShapeRing" }));
    await user.click(screen.getByRole("button", { name: "traySettings.iconSizeLarge" }));
    await user.click(screen.getByRole("button", { name: /general.displayModeDetached/ }));
    await user.click(screen.getByRole("button", { name: "traySettings.resetColors" }));

    const selects = screen.getAllByRole("combobox");
    await user.selectOptions(selects[0], "active");
    await user.selectOptions(selects[1], "1");
    await user.selectOptions(selects[2], "center");
    await user.selectOptions(selects[3], "nothing");
    await user.selectOptions(selects[4], "popup");

    expect(mocks.setTrayIconShape).toHaveBeenCalledWith("ring");
    expect(mocks.setTrayIconSize).toHaveBeenCalledWith("large");
    expect(mocks.setDisplayMode).toHaveBeenCalledWith("detached");
    expect(mocks.setTrayColors).toHaveBeenCalled();
    expect(mocks.setPopupMonitor).toHaveBeenCalledWith("active", 0, "bottom-right");
    expect(mocks.setPopupMonitor).toHaveBeenCalledWith("specific", 1, "bottom-right");
    expect(mocks.setPopupMonitor).toHaveBeenCalledWith("specific", 0, "center");
    expect(mocks.setTrayClickActions).toHaveBeenCalledWith("nothing", "menu");
    expect(mocks.setTrayClickActions).toHaveBeenCalledWith("popup", "popup");
  });

  it("updates an individual tray color through its picker", async () => {
    const user = userEvent.setup();
    const update = vi.fn();
    render(<TrayWindowSection settings={defaultSettings} update={update} />);
    await user.click(screen.getByRole("button", { name: "traySettings.stateRunning" }));
    await user.click(screen.getByTitle("#ef4444"));
    expect(update).toHaveBeenCalledWith("trayColors", expect.objectContaining({ running: "#ef4444" }));
    expect(mocks.setTrayColors).toHaveBeenCalledWith(expect.objectContaining({ running: "#ef4444" }));
  });

  it("renders unsupported Linux controls as disabled", async () => {
    Object.assign(mocks.platform, { os: "linux", supportsWindowPositioning: false, supportsTrayClickActions: false });
    render(<TrayWindowSection settings={defaultSettings} update={vi.fn()} />);
    expect(screen.getByText("traySettings.waylandPositioningUnavailable")).toBeTruthy();
    for (const select of screen.getAllByRole("combobox")) expect((select as HTMLSelectElement).disabled).toBe(true);
  });

  it("renders macOS-only settings and updates the label style", async () => {
    const user = userEvent.setup();
    Object.assign(mocks.platform, { os: "macos", supportsWindowPositioning: true, supportsTrayClickActions: true });
    const update = vi.fn();
    render(<TrayWindowSection settings={{ ...defaultSettings, menuBarLabelStyle: "timer" }} update={update} />);
    await user.click(screen.getAllByRole("switch")[0]);
    await user.click(screen.getByRole("button", { name: /timerSettings.activityName/ }));
    await user.click(screen.getAllByRole("switch")[1]);
    expect(update).toHaveBeenCalledWith("trueTrayMode", true);
    expect(update).toHaveBeenCalledWith("menuBarLabelStyle", "activity");
    expect(update).toHaveBeenCalledWith("showSecondsInTimer", false);
  });
});
