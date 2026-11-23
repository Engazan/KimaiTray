// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import Settings from "./Settings";
import { defaultSettings } from "../settings/service";

const mocks = vi.hoisted(() => ({
  settingsHook: {} as any,
  getVersion: vi.fn(),
  navigate: null as null | ((event: { payload: string }) => void),
}));

vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
vi.mock("@tauri-apps/api/app", () => ({ getVersion: mocks.getVersion }));
vi.mock("@tauri-apps/api/window", () => ({
  getCurrentWindow: () => ({ listen: (_name: string, cb: (event: { payload: string }) => void) => { mocks.navigate = cb; return Promise.resolve(vi.fn()); } }),
}));
vi.mock("../settings/useSettings", () => ({ useSettings: () => mocks.settingsHook }));
vi.mock("../hooks/useAppearance", () => ({ useAppearance: vi.fn() }));
vi.mock("../hooks/useLanguageSync", () => ({ useLanguageSync: vi.fn() }));

vi.mock("../settings/ConnectionSection", () => ({ default: ({ selectedConnectionId, onSelectedConnectionChange }: any) => <div data-testid="connection">connection:{String(selectedConnectionId)}<button onClick={() => onSelectedConnectionChange("missing")}>invalid-selection</button></div> }));
vi.mock("../settings/GeneralSection", () => ({ default: ({ update }: any) => <section data-settings-group><div data-settings-item>section-general<button onClick={() => update("language", "en")}>change-language</button></div></section> }));
vi.mock("../settings/AppearanceSection", () => ({ default: () => <div>section-appearance</div> }));
vi.mock("../settings/TrayWindowSection", () => ({ default: () => <div>section-tray</div> }));
vi.mock("../settings/IdleDetectionSection", () => ({ default: () => <div>section-idle</div> }));
vi.mock("../settings/TimerReminderSection", () => ({ default: () => <div>section-reminder</div> }));
vi.mock("../settings/ShortcutsSection", () => ({ default: () => <div>section-shortcuts</div> }));
vi.mock("../settings/TestSection", () => ({ default: ({ appVersion }: any) => <div>section-test:{appVersion}</div> }));
vi.mock("../settings/FeaturesSection", () => ({ default: ({ connectionId }: any) => <section data-settings-group><div data-settings-item>features-for:{connectionId}</div></section> }));
vi.mock("../settings/PluginsSection", () => ({ default: () => <div>plugins</div> }));
vi.mock("../settings/IntegrationsSection", () => ({ default: () => <div>integrations</div> }));
vi.mock("../settings/AboutSection", () => ({ default: () => <div>section-about</div> }));

beforeEach(() => {
  mocks.getVersion.mockResolvedValue("1.2.3");
  mocks.navigate = null;
  mocks.settingsHook = {
    settings: { ...defaultSettings, connections: [{ id: "a", name: "Alpha", url: "https://a.test" }, { id: "b", name: "Beta", url: "https://b.test" }], activeConnectionId: "a" },
    token: "token", update: vi.fn(), loaded: true, saveConnection: vi.fn(), removeConnection: vi.fn(),
  };
});
afterEach(cleanup);

describe("Settings window", () => {
  it("shows a loading state until settings are ready", () => {
    mocks.settingsHook.loaded = false;
    render(<Settings />);
    expect(screen.getByText("common.loading")).toBeTruthy();
  });

  it("navigates every sidebar section and displays app and connection metadata", async () => {
    const user = userEvent.setup();
    render(<Settings />);
    expect(screen.getByTestId("connection").textContent).toContain("connection:a");
    expect(screen.getByTitle("connection.activeSuffix")).toBeTruthy();
    await waitFor(() => expect(screen.getByText("v1.2.3")).toBeTruthy());

    const destinations = [
      ["general.title", "section-general"],
      ["appearanceSettings.title", "section-appearance"],
      ["traySettings.title", "section-tray"],
      ["timerReminder.title", "section-reminder"],
      ["idle.title", "section-idle"],
      ["shortcuts.title", "section-shortcuts"],
      ["testSection.title", "section-test:1.2.3"],
      ["aboutSection.title", "section-about"],
    ];
    for (const [button, content] of destinations) {
      await user.click(screen.getByRole("button", { name: button }));
      expect(screen.getByText(content)).toBeTruthy();
    }

    await user.click(screen.getByRole("button", { name: /Beta/ }));
    expect(screen.getByTestId("connection").textContent).toContain("connection:b");
    await user.click(screen.getByRole("button", { name: "connection.addNew" }));
    expect(screen.getByTestId("connection").textContent).toContain("connection:null");
  });

  it("falls back from a removed selection and accepts valid window navigation events", async () => {
    const user = userEvent.setup();
    render(<Settings />);
    await user.click(screen.getByRole("button", { name: "invalid-selection" }));
    expect(screen.getByTestId("connection").textContent).toContain("connection:a");
    mocks.navigate?.({ payload: "tray" });
    expect(await screen.findByText("section-tray")).toBeTruthy();
    mocks.navigate?.({ payload: "features" });
    expect(screen.getByText("section-tray")).toBeTruthy();
    mocks.navigate?.({ payload: "connection" });
    expect(await screen.findByTestId("connection")).toBeTruthy();
  });

  it("uses the first saved connection when there is no active id", () => {
    mocks.settingsHook.settings = { ...mocks.settingsHook.settings, activeConnectionId: "" };
    render(<Settings />);
    expect(screen.getByTestId("connection").textContent).toContain("connection:a");
  });

  it("filters every settings section from the sidebar search", async () => {
    const user = userEvent.setup();
    render(<Settings />);
    const search = screen.getByRole("searchbox", { name: "settings.searchPlaceholder" });

    fireEvent.keyDown(window, { key: "k", metaKey: true });
    expect(document.activeElement).toBe(search);

    await user.type(search, "general");
    expect(screen.getByText("settings.searchResults")).toBeTruthy();
    expect(screen.getByText("section-general")).toBeTruthy();
    expect(screen.queryByText("settings.searchEmpty")).toBeNull();

    await user.clear(search);
    await user.type(search, "no-such-setting");
    expect(await screen.findByText("settings.searchEmpty")).toBeTruthy();

    await user.keyboard("{Escape}");
    expect(screen.getByTestId("connection")).toBeTruthy();
  });

  it("jumps from a search result to its section and flashes the saved indicator", async () => {
    const user = userEvent.setup();
    render(<Settings />);
    await user.type(screen.getByRole("searchbox"), "section-general");
    await user.click(screen.getByRole("button", { name: "change-language" }));
    expect(mocks.settingsHook.update).toHaveBeenCalledWith("language", "en");

    await user.click(screen.getAllByRole("button", { name: "general.title" })[1]);
    expect(screen.queryByText("settings.searchResults")).toBeNull();
    expect(screen.getByText("section-general")).toBeTruthy();
  });

  it("includes the selected connection's settings in search results", async () => {
    const user = userEvent.setup();
    render(<Settings />);
    await user.click(screen.getByRole("button", { name: /Beta/ }));
    await user.type(screen.getByRole("searchbox"), "features-for");
    expect(screen.getByText("features-for:b")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Beta" }));
    expect(screen.getByTestId("connection").textContent).toContain("connection:b");
  });
});
