import { describe, expect, it } from "vitest";
import { defaultSettings, mergeSettings } from "./service";

describe("settings schema defaults", () => {
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
});
