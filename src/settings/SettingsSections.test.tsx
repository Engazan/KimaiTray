// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AppSettings } from "../types";
import { defaultFeatureSettings, defaultSettings } from "./service";
import GeneralSection from "./GeneralSection";
import IdleDetectionSection from "./IdleDetectionSection";
import TimerReminderSection from "./TimerReminderSection";
import ShortcutsSection from "./ShortcutsSection";
import PluginsSection from "./PluginsSection";
import IntegrationsSection from "./IntegrationsSection";
import FeaturesSection from "./FeaturesSection";
import AboutSection from "./AboutSection";
import {
  RadioDot,
  SelectableCard,
  SettingsCard,
  SettingsList,
  SettingsPage,
  SettingsRow,
  SettingsRowStacked,
} from "./SettingsLayout";

const mocks = vi.hoisted(() => ({
  enable: vi.fn(),
  disable: vi.fn(),
  isEnabled: vi.fn(),
  checkForUpdate: vi.fn(),
  installUpdate: vi.fn(),
  changeLanguage: vi.fn(),
  showFullscreenReminder: vi.fn(),
  loggerError: vi.fn(),
  getVersion: vi.fn(),
  openUrl: vi.fn(),
  supportsGlobalShortcuts: true,
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));
vi.mock("../shared/i18n", () => ({
  default: { changeLanguage: mocks.changeLanguage },
  resolveLanguage: (language: string) => language === "system" ? "en" : language,
}));
vi.mock("@tauri-apps/plugin-autostart", () => ({
  enable: mocks.enable,
  disable: mocks.disable,
  isEnabled: mocks.isEnabled,
}));
vi.mock("../api/updater", () => ({
  checkForUpdate: mocks.checkForUpdate,
  installUpdate: mocks.installUpdate,
}));
vi.mock("../api/reminderWindow", () => ({
  showFullscreenReminder: mocks.showFullscreenReminder,
}));
vi.mock("../utils/logger", () => ({ logger: { error: mocks.loggerError } }));
vi.mock("@tauri-apps/api/app", () => ({ getVersion: mocks.getVersion }));
vi.mock("@tauri-apps/plugin-opener", () => ({ openUrl: mocks.openUrl }));
vi.mock("../platform", () => ({
  usePlatform: () => ({ supportsGlobalShortcuts: mocks.supportsGlobalShortcuts }),
  currentPlatform: () => ({ os: "linux" }),
}));
vi.mock("../categorymode/CategoryModeSettingsSection", () => ({
  default: ({ connectionId, url }: { connectionId: string; url: string }) => (
    <div data-testid="category-editor">{connectionId}:{url}</div>
  ),
}));
vi.mock("./integrations/registry", () => ({
  INTEGRATIONS: [{
    id: "issues",
    nameKey: "integration.name",
    descriptionKey: "integration.description",
    icon: <span>icon</span>,
    isEnabled: (settings: AppSettings, id: string) => Boolean(settings.issueIntegrations[id]?.enabled),
    detail: ({ onBack }: { onBack: () => void }) => <button onClick={onBack}>integration.back</button>,
  }],
}));

const settings = (patch: Partial<AppSettings> = {}): AppSettings => ({
  ...defaultSettings,
  ...patch,
});

beforeEach(() => {
  vi.clearAllMocks();
  mocks.supportsGlobalShortcuts = true;
  mocks.isEnabled.mockResolvedValue(false);
  mocks.enable.mockResolvedValue(undefined);
  mocks.disable.mockResolvedValue(undefined);
  mocks.checkForUpdate.mockResolvedValue(null);
  mocks.installUpdate.mockResolvedValue(undefined);
  mocks.showFullscreenReminder.mockResolvedValue(undefined);
  mocks.getVersion.mockResolvedValue("1.2.3");
  mocks.openUrl.mockResolvedValue(undefined);
});

afterEach(cleanup);

describe("GeneralSection", () => {
  it("updates preferences, enables autostart and installs an available update", async () => {
    const user = userEvent.setup();
    const update = vi.fn();
    const available = { version: "2.0.0" };
    mocks.checkForUpdate.mockResolvedValue(available);
    render(<GeneralSection settings={settings()} update={update} />);

    await waitFor(() => expect(mocks.isEnabled).toHaveBeenCalled());
    await user.selectOptions(screen.getAllByRole("combobox")[0], "de");
    await user.click(screen.getAllByRole("switch")[0]);
    await user.selectOptions(screen.getAllByRole("combobox")[1], "300");
    await user.click(screen.getAllByRole("switch")[1]);
    await user.click(screen.getAllByRole("switch")[2]);
    await user.click(screen.getByRole("button", { name: "updateSettings.checkForUpdates" }));

    expect(update).toHaveBeenCalledWith("language", "de");
    expect(mocks.changeLanguage).toHaveBeenCalledWith("de");
    expect(mocks.enable).toHaveBeenCalled();
    expect(update).toHaveBeenCalledWith("refreshInterval", 300);
    expect(update).toHaveBeenCalledWith("openKimaiInBrowser", false);
    expect(update).toHaveBeenCalledWith("autoUpdate", false);
    await waitFor(() => expect(mocks.installUpdate).toHaveBeenCalledWith(available));
    expect(screen.getByText("updateSettings.updateAvailable")).toBeTruthy();
  });

  it("disables autostart and reports both up-to-date and failed checks", async () => {
    const user = userEvent.setup();
    const update = vi.fn();
    mocks.isEnabled.mockResolvedValue(true);
    const { unmount } = render(<GeneralSection settings={settings({ launchAtLogin: true })} update={update} />);
    await waitFor(() => expect(screen.getAllByRole("switch")[0].getAttribute("aria-checked")).toBe("true"));
    await user.click(screen.getAllByRole("switch")[0]);
    expect(mocks.disable).toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "updateSettings.checkForUpdates" }));
    expect(await screen.findByText("updateSettings.upToDate")).toBeTruthy();
    unmount();

    mocks.checkForUpdate.mockRejectedValue(new Error("offline"));
    render(<GeneralSection settings={settings()} update={update} />);
    await user.click(screen.getByRole("button", { name: "updateSettings.checkForUpdates" }));
    expect(await screen.findByText("updateSettings.checkFailed")).toBeTruthy();
  });

  it("keeps autostart unchanged when the operating-system call fails", async () => {
    const user = userEvent.setup();
    const update = vi.fn();
    mocks.isEnabled.mockRejectedValue(new Error("unsupported"));
    mocks.enable.mockRejectedValue(new Error("unsupported"));
    render(<GeneralSection settings={settings()} update={update} />);
    await user.click(screen.getAllByRole("switch")[0]);
    await waitFor(() => expect(mocks.enable).toHaveBeenCalled());
    expect(update).not.toHaveBeenCalledWith("launchAtLogin", true);
  });
});

describe("reminder sections", () => {
  it("updates idle settings and opens a representative test reminder", async () => {
    const user = userEvent.setup();
    const update = vi.fn();
    render(<IdleDetectionSection settings={settings({ enableIdleDetection: true, idleThresholdMinutes: 7 })} update={update} />);

    await user.click(screen.getAllByRole("switch")[0]);
    fireEvent.change(screen.getByRole("spinbutton"), { target: { value: "12" } });
    await user.selectOptions(screen.getByRole("combobox"), "discard");
    await user.click(screen.getAllByRole("switch")[1]);
    await user.click(screen.getByRole("button", { name: "idle.testReminderButton" }));

    expect(update).toHaveBeenCalledWith("enableIdleDetection", false);
    expect(update).toHaveBeenCalledWith("idleThresholdMinutes", 12);
    expect(update).toHaveBeenCalledWith("idleAction", "discard");
    expect(update).toHaveBeenCalledWith("showIdleNotification", false);
    await waitFor(() => expect(mocks.showFullscreenReminder).toHaveBeenCalledWith(expect.objectContaining({
      kind: "idle", test: true, idleDurationSeconds: 420, processing: false,
    })));
  });

  it("logs idle reminder failures and disables dependent controls", async () => {
    const user = userEvent.setup();
    mocks.showFullscreenReminder.mockRejectedValue(new Error("window failed"));
    render(<IdleDetectionSection settings={settings()} update={vi.fn()} />);
    expect((screen.getByRole("spinbutton") as HTMLInputElement).disabled).toBe(true);
    expect((screen.getByRole("combobox") as HTMLSelectElement).disabled).toBe(true);
    await user.click(screen.getByRole("button", { name: "idle.testReminderButton" }));
    await waitFor(() => expect(mocks.loggerError).toHaveBeenCalledWith(expect.stringContaining("window failed")));
  });

  it("updates and tests the missing-timer reminder, including its error path", async () => {
    const user = userEvent.setup();
    const update = vi.fn();
    const { unmount } = render(<TimerReminderSection settings={settings({ enableNoTimerReminder: true })} update={update} />);
    await user.click(screen.getByRole("switch"));
    fireEvent.change(screen.getByRole("spinbutton"), { target: { value: "30" } });
    await user.click(screen.getByRole("button", { name: "timerReminder.testButton" }));
    expect(update).toHaveBeenCalledWith("enableNoTimerReminder", false);
    expect(update).toHaveBeenCalledWith("noTimerReminderMinutes", 30);
    await waitFor(() => expect(mocks.showFullscreenReminder).toHaveBeenCalledWith({ kind: "timer" }));
    unmount();

    mocks.showFullscreenReminder.mockRejectedValue(new Error("denied"));
    render(<TimerReminderSection settings={settings()} update={vi.fn()} />);
    expect((screen.getByRole("spinbutton") as HTMLInputElement).disabled).toBe(true);
    await user.click(screen.getByRole("button", { name: "timerReminder.testButton" }));
    await waitFor(() => expect(mocks.loggerError).toHaveBeenCalledWith(expect.stringContaining("denied")));
  });
});

describe("feature and plugin settings", () => {
  it("updates plugin configuration only for saved connections", async () => {
    const user = userEvent.setup();
    const update = vi.fn();
    const base = settings();
    const { rerender } = render(<PluginsSection settings={base} update={update} connectionId="conn" />);
    await user.click(screen.getByRole("switch"));
    expect(update).toHaveBeenCalledWith("plugins", { conn: { creativeIssueLink: true } });

    update.mockClear();
    rerender(<PluginsSection settings={base} update={update} connectionId="" />);
    await user.click(screen.getByRole("switch"));
    expect(update).not.toHaveBeenCalled();
  });

  it("updates toggles and clamps daily goal inputs", async () => {
    const user = userEvent.setup();
    const update = vi.fn();
    const feature = { ...defaultFeatureSettings, featureDailyGoal: true, featureCategoryMode: true };
    const configured = settings({
      connections: [{ id: "conn", name: "Kimai", url: "https://kimai.test" }],
      features: { conn: feature },
    });
    render(<FeaturesSection settings={configured} update={update} connectionId="conn" />);

    for (const toggle of screen.getAllByRole("switch")) await user.click(toggle);
    fireEvent.change(screen.getByLabelText("featuresSettings.requiredGoalHours"), { target: { value: "30" } });
    fireEvent.change(screen.getByLabelText("featuresSettings.requiredGoalMinutes"), { target: { value: "30" } });
    fireEvent.change(screen.getByLabelText("featuresSettings.fullGoalHours"), { target: { value: "7" } });
    fireEvent.change(screen.getByLabelText("featuresSettings.fullGoalMinutes"), { target: { value: "0" } });
    const requiredMinutes = screen.getByLabelText("featuresSettings.requiredGoalMinutes") as HTMLInputElement;
    Object.defineProperty(requiredMinutes, "value", { configurable: true, get: () => "NaN" });
    fireEvent.change(requiredMinutes);

    expect(update).toHaveBeenCalledWith("features", expect.objectContaining({
      conn: expect.objectContaining({ featureNote: false }),
    }));
    expect(update).toHaveBeenCalledWith("features", expect.objectContaining({
      conn: expect.objectContaining({ dailyGoalMinutes: 1440, fullDailyGoalMinutes: 1440 }),
    }));
  });

  it("opens and closes category configuration and handles unsaved connections", async () => {
    const user = userEvent.setup();
    const configured = settings({
      connections: [{ id: "conn", name: "Kimai", url: "https://kimai.test" }],
      features: { conn: { ...defaultFeatureSettings, featureCategoryMode: true } },
    });
    const { rerender } = render(<FeaturesSection settings={configured} update={vi.fn()} connectionId="conn" />);
    await user.click(screen.getByRole("button", { name: /featuresSettings.categoryModeConfigure/ }));
    expect(screen.getByTestId("category-editor").textContent).toContain("conn:https://kimai.test");
    await user.click(screen.getByRole("button", { name: "featuresSettings.title" }));
    expect(screen.queryByTestId("category-editor")).toBeNull();

    rerender(<FeaturesSection settings={configured} update={vi.fn()} connectionId="" />);
    expect(screen.getByText("connection.saveFirstForFeatures")).toBeTruthy();
  });

  it("uses feature defaults when a saved connection has no feature record", async () => {
    const user = userEvent.setup();
    const update = vi.fn();
    const configured = settings({
      connections: [{ id: "conn", name: "Kimai", url: "https://kimai.test" }],
      features: {},
    });
    render(<FeaturesSection settings={configured} update={update} connectionId="conn" />);
    await user.click(screen.getAllByRole("switch")[0]);
    expect(update).toHaveBeenCalledWith("features", expect.objectContaining({ conn: expect.any(Object) }));
  });
});

describe("shortcuts, integrations and about", () => {
  it("records shortcuts, reports conflicts and shows platform limitations", async () => {
    const user = userEvent.setup();
    const update = vi.fn();
    const configured = settings({ shortcutTogglePopup: "CommandOrControl+K", shortcutNewTask: "CommandOrControl+K" });
    const { unmount } = render(<ShortcutsSection settings={configured} update={update} />);
    expect(screen.getAllByText("shortcuts.conflict").length).toBe(2);
    const unset = screen.getAllByRole("button", { name: "shortcuts.notSet" })[0];
    await user.click(unset);
    fireEvent.keyDown(window, { key: "p", code: "KeyP", ctrlKey: true });
    expect(update).toHaveBeenCalledWith("shortcutStartStopTimer", "CommandOrControl+P");
    unmount();

    const unique = settings({ shortcutTogglePopup: "CommandOrControl+U" });
    const uniqueView = render(
      <ShortcutsSection settings={unique} update={vi.fn()} />,
    );
    expect(screen.queryByText("shortcuts.conflict")).toBeNull();
    uniqueView.unmount();

    mocks.supportsGlobalShortcuts = false;
    render(<ShortcutsSection settings={settings()} update={vi.fn()} />);
    expect(screen.getByText("shortcuts.waylandUnavailable")).toBeTruthy();
    expect((screen.getAllByRole("button")[0] as HTMLButtonElement).disabled).toBe(true);
  });

  it("requires a saved connection and navigates into and out of an integration", async () => {
    const user = userEvent.setup();
    const configured = settings({ issueIntegrations: { conn: { enabled: true } as never } });
    const { rerender } = render(<IntegrationsSection settings={configured} update={vi.fn()} connectionId="" />);
    expect(screen.getByText("connection.saveFirstForIntegrations")).toBeTruthy();

    rerender(<IntegrationsSection settings={configured} update={vi.fn()} connectionId="conn" />);
    expect(screen.getByText("integrations.statusEnabled")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: /integration.name/ }));
    await user.click(screen.getByRole("button", { name: "integration.back" }));
    expect(screen.getByText("integrations.statusEnabled")).toBeTruthy();
  });

  it("loads the app version and opens only active external links", async () => {
    const user = userEvent.setup();
    render(<AboutSection />);
    await waitFor(() => expect(mocks.getVersion).toHaveBeenCalled());
    expect(screen.getByText("aboutSection.version")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: /aboutSection.githubRepo/ }));
    await user.click(screen.getByRole("button", { name: /aboutSection.reportIssue/ }));
    await user.click(screen.getByRole("button", { name: "GitHub Sponsors" }));
    expect(mocks.openUrl).toHaveBeenCalledTimes(3);
    expect((screen.getByRole("button", { name: /aboutSection.website/ }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole("button", { name: "Ko-fi" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("tolerates rejected external-link opens", async () => {
    const user = userEvent.setup();
    mocks.openUrl.mockRejectedValue(new Error("blocked"));
    render(<AboutSection />);
    await user.click(screen.getByRole("button", { name: /aboutSection.githubRepo/ }));
    await user.click(screen.getByRole("button", { name: "GitHub Sponsors" }));
    await Promise.resolve();
    expect(mocks.openUrl).toHaveBeenCalledTimes(2);
  });
});

describe("settings layout primitives", () => {
  it("renders optional headings, active states and clickable cards", async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    const { container } = render(
      <SettingsPage title="Page" description="Page help">
        <SettingsList title="List" description="List help" allowOverflow><SettingsRow label="Row" description="Row help" inset><span>control</span></SettingsRow></SettingsList>
        <SettingsCard title="Card" description="Card help" className="custom">body</SettingsCard>
        <SettingsRowStacked label="Stack" description="Stack help">stacked</SettingsRowStacked>
        <SelectableCard active onClick={onClick} title="select"><RadioDot active size="sm" />pick</SelectableCard>
        <RadioDot active={false} />
      </SettingsPage>,
    );
    expect(screen.getByRole("heading", { name: "Page" })).toBeTruthy();
    expect(container.querySelector(".overflow-visible")).toBeTruthy();
    expect(container.querySelector(".custom")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "pick" }));
    expect(onClick).toHaveBeenCalled();
  });
});
