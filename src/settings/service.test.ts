import { beforeEach, describe, expect, it, vi } from "vitest";
import ipcContract from "../../contracts/ipc-contract.json";

const storeMocks = vi.hoisted(() => ({
  load: vi.fn(),
  get: vi.fn(),
  invoke: vi.fn(),
  emit: vi.fn(),
  listen: vi.fn(),
}));

vi.mock("@tauri-apps/plugin-store", () => ({ load: storeMocks.load }));
vi.mock("@tauri-apps/api/core", () => ({ invoke: storeMocks.invoke }));
vi.mock("@tauri-apps/api/event", () => ({
  emit: storeMocks.emit,
  listen: storeMocks.listen,
}));

import { defaultSettings, loadSettings, mergeSettings } from "./service";

describe("settings schema defaults", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    storeMocks.load.mockResolvedValue({
      get: storeMocks.get,
    });
  });

  it("keeps the shared native settings contract aligned with AppSettings", () => {
    expect(new Set(ipcContract.settingsKeys)).toEqual(
      new Set(Object.keys(defaultSettings)),
    );
  });
  it("deep-merges partial nested settings without mutating defaults", () => {
    const merged = mergeSettings({
      trayColors: { running: "#123456" } as typeof defaultSettings.trayColors,
      features: undefined,
      issueIntegrations: undefined,
    });

    expect(merged.trayColors.running).toBe("#123456");
    expect(merged.trayColors.idle).toBe(defaultSettings.trayColors.idle);
    expect(merged.features).toEqual({});
    expect(merged.issueIntegrations).toEqual({});
    expect(defaultSettings.trayColors.running).not.toBe("#123456");
  });

  it("rejects a malformed connections collection by restoring an empty list", () => {
    const merged = mergeSettings({
      connections: "invalid" as unknown as typeof defaultSettings.connections,
    });
    expect(merged.connections).toEqual([]);
  });

  it("normalizes corrupted scalar settings and numeric ranges", () => {
    const merged = mergeSettings({
      language: "fr",
      refreshInterval: "600",
      idleThresholdMinutes: -20,
      noTimerReminderMinutes: 2000,
      popupMonitorIndex: 999,
      popupLayout: "unknown",
      enableIdleDetection: "true",
      trayIconShape: "triangle",
      shortcutNewTask: 42,
    } as unknown as Partial<typeof defaultSettings>);

    expect(merged.language).toBe(defaultSettings.language);
    expect(merged.refreshInterval).toBe(defaultSettings.refreshInterval);
    expect(merged.idleThresholdMinutes).toBe(1);
    expect(merged.noTimerReminderMinutes).toBe(1440);
    expect(merged.popupMonitorIndex).toBe(255);
    expect(merged.popupLayout).toBe(defaultSettings.popupLayout);
    expect(merged.enableIdleDetection).toBe(defaultSettings.enableIdleDetection);
    expect(merged.trayIconShape).toBe(defaultSettings.trayIconShape);
    expect(merged.shortcutNewTask).toBe("");
  });

  it("filters malformed nested records while preserving valid settings", () => {
    const merged = mergeSettings({
      refreshInterval: 300,
      connections: [
        { id: "connection-a", name: "Primary", url: "https://kimai.test" },
        { id: "connection-a", name: "Duplicate", url: "https://other.test" },
        { id: "", name: "Invalid", url: "https://invalid.test" },
      ],
      activeConnectionId: "connection-a",
      trayColors: {
        idle: "not-a-color",
        running: "#123456",
      },
      features: {
        "connection-a": {
          featureNote: false,
          featureTags: "invalid",
        },
      },
      issueIntegrations: {
        "connection-a": {
          enabled: true,
          provider: "invalid",
          baseUrl: "https://git.test",
          filterLabels: ["bug", 123],
          filterLabelsMode: "exclude",
        },
      },
    } as unknown as Partial<typeof defaultSettings>);

    expect(merged.refreshInterval).toBe(300);
    expect(merged.connections).toEqual([
      { id: "connection-a", name: "Primary", url: "https://kimai.test" },
    ]);
    expect(merged.activeConnectionId).toBe("connection-a");
    expect(merged.trayColors.idle).toBe(defaultSettings.trayColors.idle);
    expect(merged.trayColors.running).toBe("#123456");
    expect(merged.features["connection-a"]).toEqual({
      ...defaultSettings.features["connection-a"],
      featureNote: false,
      featureTags: false,
      featurePausedTimerDescriptionHover: false,
      featureCustomerSelect: true,
      featureCustomStartTime: true,
      featureDailyGoal: false,
      dailyGoalMinutes: 450,
      fullDailyGoalMinutes: 480,
      featureCategoryMode: false,
    });
    expect(merged.issueIntegrations["connection-a"]).toMatchObject({
      enabled: true,
      provider: "gitlab",
      baseUrl: "https://git.test",
      filterLabels: ["bug"],
      filterLabelsMode: "exclude",
    });
  });

  it("disables daily goals by default and keeps the full goal after the required goal", () => {
    const merged = mergeSettings({
      features: {
        "connection-a": {
          featureDailyGoal: "invalid",
          dailyGoalMinutes: 600,
          fullDailyGoalMinutes: 300,
        },
      },
    } as unknown as Partial<typeof defaultSettings>);

    expect(merged.features["connection-a"]).toMatchObject({
      featureDailyGoal: false,
      dailyGoalMinutes: 600,
      fullDailyGoalMinutes: 600,
    });
  });

  it("keeps normalized settings when migration persistence fails", async () => {
    storeMocks.get.mockResolvedValue({
      theme: "dark",
      useCompactPopup: true,
    });
    storeMocks.invoke.mockRejectedValue(new Error("disk unavailable"));

    const settings = await loadSettings();

    expect(settings.theme).toBe("dark");
    expect(settings.uiSize).toBe("small");
    expect(storeMocks.invoke).toHaveBeenCalledWith("patch_settings", {
      request: { values: { uiSize: "small" }, expected: undefined },
    });
  });
});
