import { beforeEach, describe, expect, it, vi } from "vitest";
import ipcContract from "../../contracts/ipc-contract.json";

const storeMocks = vi.hoisted(() => ({
  load: vi.fn(),
  get: vi.fn(),
  invoke: vi.fn(),
  emit: vi.fn(),
  listen: vi.fn(),
  onKeyChange: vi.fn(),
  migrate: vi.fn(),
}));

vi.mock("@tauri-apps/plugin-store", () => ({ load: storeMocks.load }));
vi.mock("@tauri-apps/api/core", () => ({ invoke: storeMocks.invoke }));
vi.mock("@tauri-apps/api/event", () => ({
  emit: storeMocks.emit,
  listen: storeMocks.listen,
}));
vi.mock("../api/storeMigrations", () => ({ migrateLegacyStore: storeMocks.migrate }));

import { defaultSettings, loadSettings, mergeSettings, onSettingsChange, patchSettings } from "./service";

describe("settings schema defaults", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    storeMocks.load.mockResolvedValue({
      get: storeMocks.get,
      onKeyChange: storeMocks.onKeyChange,
    });
    storeMocks.emit.mockResolvedValue(undefined);
    storeMocks.listen.mockResolvedValue(vi.fn());
    storeMocks.onKeyChange.mockResolvedValue(vi.fn());
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
      plugins: undefined,
      issueIntegrations: undefined,
    });

    expect(merged.trayColors.running).toBe("#123456");
    expect(merged.trayColors.idle).toBe(defaultSettings.trayColors.idle);
    expect(merged.features).toEqual({});
    expect(merged.plugins).toEqual({});
    expect(merged.issueIntegrations).toEqual({});
    expect(defaultSettings.trayColors.running).not.toBe("#123456");
  });

  it("normalizes per-connection timesheet custom fields", () => {
    const merged = mergeSettings({
      timesheetCustomFields: {
        conn: [
          { name: " URL_Link ", label: "Ticket URL", type: "url", required: true },
          { name: "url_link", label: "Duplicate", type: "text", required: false },
          { name: "!", label: "Invalid", type: "other", required: "yes" },
        ],
        malformed: "not-an-array",
        primitives: [null, "field"],
      },
    } as unknown as Partial<typeof defaultSettings>);

    expect(merged.timesheetCustomFields.conn).toEqual([
      { name: "url_link", label: "Ticket URL", type: "url", required: true },
    ]);
  });

  it("rejects a malformed connections collection by restoring an empty list", () => {
    const merged = mergeSettings({
      connections: "invalid" as unknown as typeof defaultSettings.connections,
    });
    expect(merged.connections).toEqual([]);
  });

  it("keeps description as the legacy auto-insert URL target", () => {
    const merged = mergeSettings({
      issueIntegrations: {
        "connection-a": {
          autoInsertUrl: true,
        },
      },
    } as unknown as Partial<typeof defaultSettings>);

    expect(
      merged.issueIntegrations["connection-a"].autoInsertUrlTarget,
    ).toBe("description");
  });

  it("normalizes corrupted scalar settings and numeric ranges", () => {
    const merged = mergeSettings({
      language: "fr",
      refreshInterval: "600",
      idleThresholdMinutes: -20,
      noTimerReminderMinutes: 2000,
      popupMonitorIndex: 999,
      popupHeight: 9999,
      popupLayout: "unknown",
      enableIdleDetection: "true",
      stopTimerOnScreensaver: "true",
      stopTimerOnScreenLock: "true",
      trayIconShape: "triangle",
      shortcutNewTask: 42,
    } as unknown as Partial<typeof defaultSettings>);

    expect(merged.language).toBe(defaultSettings.language);
    expect(merged.refreshInterval).toBe(defaultSettings.refreshInterval);
    expect(merged.idleThresholdMinutes).toBe(1);
    expect(merged.noTimerReminderMinutes).toBe(1440);
    expect(merged.popupMonitorIndex).toBe(255);
    expect(merged.popupHeight).toBe(1200);
    expect(merged.popupLayout).toBe(defaultSettings.popupLayout);
    expect(merged.enableIdleDetection).toBe(defaultSettings.enableIdleDetection);
    expect(merged.stopTimerOnScreensaver).toBe(false);
    expect(merged.stopTimerOnScreenLock).toBe(false);
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
      plugins: {
        "connection-a": {
          customFields: true,
        },
        invalid: {
          customFields: "yes",
        },
      },
      issueIntegrations: {
        "connection-a": {
          enabled: true,
          provider: "invalid",
          baseUrl: "https://git.test",
          autoInsertUrlTarget: "plugin:custom:field",
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
    expect(merged.plugins["connection-a"]).toEqual({
      creativeIssueLink: true,
    });
    expect(merged.plugins.invalid).toEqual({
      creativeIssueLink: false,
    });
    expect(merged.issueIntegrations["connection-a"]).toMatchObject({
      enabled: true,
      provider: "gitlab",
      baseUrl: "https://git.test",
      autoInsertUrlTarget: "plugin:custom:field",
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

  it("filters non-record and overlong nested entries", () => {
    const longId = "x".repeat(257);
    const merged = mergeSettings({
      connections: [null, "bad", { id: "ok", name: "Name", url: "https://x" }],
      features: { [longId]: {}, invalid: null },
      plugins: { [longId]: {}, invalid: null },
      issueIntegrations: { [longId]: {}, invalid: null },
    } as unknown as Partial<typeof defaultSettings>);
    expect(merged.connections).toHaveLength(1);
    expect(merged.features).toEqual({});
    expect(merged.plugins).toEqual({});
    expect(merged.issueIntegrations).toEqual({});
  });

  it("loads defaults for an empty or failed store", async () => {
    storeMocks.get.mockResolvedValueOnce(null).mockRejectedValueOnce(new Error("read"));
    expect(await loadSettings()).toEqual(defaultSettings);
    expect(await loadSettings()).toEqual(defaultSettings);
  });

  it("claims a legacy connection and derives its host name", async () => {
    storeMocks.get.mockResolvedValue({ kimaiUrl: "https://legacy.example/path", connections: [] });
    storeMocks.migrate.mockResolvedValue({
      kimaiUrl: "https://legacy.example/path",
      connections: [{ id: "generated", name: "legacy.example", url: "https://legacy.example/path" }],
      activeConnectionId: "generated",
    });
    const settings = await loadSettings();
    expect(storeMocks.migrate).toHaveBeenCalledWith(expect.objectContaining({ type: "settingsConnection", name: "legacy.example" }));
    expect(settings.activeConnectionId).toBe("generated");
  });

  it("keeps loading when the legacy URL or native claim is invalid", async () => {
    storeMocks.get.mockResolvedValue({ kimaiUrl: "not a url", connections: [] });
    storeMocks.migrate.mockRejectedValue(new Error("claim"));
    const settings = await loadSettings();
    expect(storeMocks.migrate).toHaveBeenCalledWith(expect.objectContaining({ name: "Kimai" }));
    expect(settings.kimaiUrl).toBe("not a url");
  });

  it("migrates flat features to every connection", async () => {
    storeMocks.get.mockResolvedValue({
      connections: [
        { id: "a", name: "A", url: "https://a" },
        { id: "b", name: "B", url: "https://b" },
      ],
      featureNote: false,
      featureTags: true,
      featureCustomerSelect: false,
      featureCustomStartTime: false,
      featurePausedTimerDescriptionHover: true,
    });
    storeMocks.invoke.mockResolvedValue({ value: {} });
    const settings = await loadSettings();
    expect(settings.features.a).toMatchObject({ featureNote: false, featureTags: true });
    expect(settings.features.b).toMatchObject({ featureCustomerSelect: false });
    expect(storeMocks.invoke).toHaveBeenCalledWith("patch_settings", expect.objectContaining({ request: expect.objectContaining({ values: { features: settings.features } }) }));
  });

  it("migrates the legacy per-connection category mode", async () => {
    storeMocks.get.mockResolvedValue({
      connections: [{ id: "a", name: "A", url: "https://a" }],
      features: { a: { featureCsMode: true } },
    });
    storeMocks.invoke.mockResolvedValue({ value: {} });
    const settings = await loadSettings();
    expect(settings.features.a.featureCategoryMode).toBe(true);
    expect(storeMocks.invoke).toHaveBeenCalled();
  });

  it("patches settings despite event failures", async () => {
    storeMocks.invoke.mockResolvedValue({ value: { theme: "dark" } });
    storeMocks.emit.mockRejectedValue(new Error("event"));
    const settings = await patchSettings({ theme: "dark" }, { theme: "light" });
    expect(settings.theme).toBe("dark");
    expect(storeMocks.invoke).toHaveBeenCalledWith("patch_settings", { request: { values: { theme: "dark" }, expected: { theme: "light" } } });
  });

  it("subscribes to store and event changes and cleans both listeners", async () => {
    const storeUnlisten = vi.fn();
    const eventUnlisten = vi.fn();
    let storeCallback!: (value: any) => void;
    let eventCallback!: (event: any) => void;
    storeMocks.onKeyChange.mockImplementation(async (_key, callback) => {
      storeCallback = callback;
      return storeUnlisten;
    });
    storeMocks.listen.mockImplementation(async (_event, callback) => {
      eventCallback = callback;
      return eventUnlisten;
    });
    const callback = vi.fn();
    const unlisten = await onSettingsChange(callback);
    storeCallback({ theme: "dark" });
    eventCallback({ payload: { theme: "transparent" } });
    expect(callback).toHaveBeenNthCalledWith(1, expect.objectContaining({ theme: "dark" }));
    expect(callback).toHaveBeenNthCalledWith(2, expect.objectContaining({ theme: "transparent" }));
    unlisten();
    expect(storeUnlisten).toHaveBeenCalled();
    expect(eventUnlisten).toHaveBeenCalled();
  });
});
