// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import AppearanceSection from "./AppearanceSection";
import ColorPicker from "./ColorPicker";
import PopupPreview from "./PopupPreview";
import TrayBarPreview from "./TrayBarPreview";
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
    await user.selectOptions(screen.getByRole("combobox", { name: "appearanceSettings.colorMode" }), "activity-project");

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

describe("PopupPreview", () => {
  it.each([
    ["classic", "light", "kimai"],
    ["focus", "dark", "project"],
    ["taskbar", "transparent", "customer"],
    ["timeline", "transparent", "activity-project"],
    ["classic", "dark", "activity-customer"],
    ["focus", "light", "project-customer"],
  ] as const)("renders the %s layout in the %s theme with %s colors", (popupLayout, theme, colorMode) => {
    const { container } = render(
      <PopupPreview
        label="preview"
        settings={{
          ...defaultSettings,
          popupLayout,
          theme,
          colorMode,
          reduceVisualEffects: popupLayout === "timeline",
          roundedPopupCorners: theme !== "dark",
          showSecondsInTimer: theme === "light",
          uiSize: "unknown" as never,
        }}
      />,
    );
    expect(screen.getByRole("img", { name: "preview" })).toBeTruthy();
    expect(container.textContent).toContain("KimaiTray");
    expect(container.textContent).toContain(theme === "light" ? "01:24:07" : "KimaiTray");
  });

  it("falls back to the light palette for an unknown theme", () => {
    render(<PopupPreview label="preview" settings={{ ...defaultSettings, theme: "neon" as never }} />);
    expect(screen.getByRole("img", { name: "preview" })).toBeTruthy();
  });
});

describe("OS-specific previews", () => {
  it.each(["macos", "windows", "linux", "unknown"] as const)("renders the %s tray area", (os) => {
    const { container } = render(<TrayBarPreview os={os} dark={os === "windows"} ariaLabel="bar" icon={<i data-testid="icon" />} label={os === "macos" ? "1:23" : ""} />);
    expect(screen.getByRole("img", { name: "bar" }).dataset.trayPreview).toBe(os === "unknown" ? "macos" : os);
    expect(screen.getByTestId("icon")).toBeTruthy();
    expect(container.textContent?.includes("1:23")).toBe(os === "macos");
  });

  it("renders a light Windows taskbar", () => {
    render(<TrayBarPreview os="windows" dark={false} ariaLabel="bar" icon={null} label="" />);
    expect(screen.getByRole("img", { name: "bar" }).innerHTML).toContain("f3f3f3");
  });

  it("only blurs the transparent popup on macOS and follows the system appearance", () => {
    const transparent = { ...defaultSettings, theme: "transparent" as const };
    const { rerender } = render(<PopupPreview label="p" settings={transparent} os="macos" prefersDark />);
    expect(screen.getByRole("img", { name: "p" }).dataset.previewBlur).toBe("true");
    rerender(<PopupPreview label="p" settings={transparent} os="windows" />);
    expect(screen.getByRole("img", { name: "p" }).dataset.previewBlur).toBe("false");
  });

  it("describes the missing blur in the theme picker off macOS", () => {
    mocks.platform.os = "windows";
    render(<AppearanceSection settings={defaultSettings} update={vi.fn()} />);
    expect(screen.getByText("appearanceSettings.transparentNoBlur")).toBeTruthy();
  });

  it("shows the menu bar label only on macOS and tracks system dark mode", async () => {
    const listeners: Array<() => void> = [];
    let dark = false;
    vi.stubGlobal("matchMedia", (query: string) => ({
      matches: dark, media: query,
      addEventListener: (_: string, cb: () => void) => listeners.push(cb),
      removeEventListener: vi.fn(),
    }));
    try {
      mocks.platform.os = "windows";
      const { container, unmount } = render(<TrayWindowSection settings={{ ...defaultSettings, menuBarLabelStyle: "timer" }} update={vi.fn()} />);
      const bar = () => container.querySelector("[data-tray-preview]") as HTMLElement;
      expect(bar().dataset.trayPreview).toBe("windows");
      expect(bar().innerHTML).toContain("f3f3f3");
      dark = true;
      await act(async () => { listeners.forEach((cb) => cb()); });
      expect(bar().innerHTML).toContain("202020");
      expect(bar().textContent).not.toMatch(/1:23/);
      unmount();
      mocks.platform.os = "macos";
      render(<TrayWindowSection settings={{ ...defaultSettings, menuBarLabelStyle: "timer", showSecondsInTimer: false }} update={vi.fn()} />);
      expect(document.querySelector("[data-tray-preview]")?.textContent).toMatch(/1:23/);
    } finally {
      vi.unstubAllGlobals();
    }
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
    const pausedPreview = screen.getByRole("button", { name: "traySettings.previewTitle: traySettings.statePaused" });
    await user.click(pausedPreview);
    expect(pausedPreview.getAttribute("aria-pressed")).toBe("true");

    await user.click(screen.getByRole("button", { name: "traySettings.popupMonitorModeActive" }));
    const selects = screen.getAllByRole("combobox");
    await user.selectOptions(selects[0], "nothing");
    await user.selectOptions(selects[1], "popup");
    await user.selectOptions(selects[2], "1");
    await user.click(screen.getByRole("button", { name: "traySettings.popupMonitorPositionCenter" }));

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
    await user.click(screen.getByRole("switch", { name: "traySettings.trueTray" }));
    await user.click(screen.getByRole("button", { name: /timerSettings.activityName/ }));
    await user.click(screen.getByRole("switch", { name: "timerSettings.showSeconds" }));
    expect(update).toHaveBeenCalledWith("trueTrayMode", true);
    expect(update).toHaveBeenCalledWith("menuBarLabelStyle", "activity");
    expect(update).toHaveBeenCalledWith("showSecondsInTimer", false);
  });
});
