// @vitest-environment jsdom

import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AppSettings, SavedConnection } from "../types";

const serviceMocks = vi.hoisted(() => ({
  loadSettings: vi.fn<() => Promise<AppSettings>>(),
  saveSettings: vi.fn<(settings: AppSettings) => Promise<void>>(),
}));
const tokenMocks = vi.hoisted(() => ({
  getConnectionToken: vi.fn<() => Promise<string | null>>(),
  saveConnectionToken: vi.fn<() => Promise<void>>(),
  deleteConnectionToken: vi.fn<() => Promise<void>>(),
}));

vi.mock("./service", async () => {
  const actual = await vi.importActual<typeof import("./service")>("./service");
  return {
    ...actual,
    loadSettings: serviceMocks.loadSettings,
    saveSettings: serviceMocks.saveSettings,
  };
});
vi.mock("../api/connectionTokenStore", () => tokenMocks);

import { defaultSettings } from "./service";
import { useSettings } from "./useSettings";

const existingConnection: SavedConnection = {
  id: "connection-a",
  name: "Primary",
  url: "https://kimai-a.example.test",
};

function initialSettings(): AppSettings {
  return {
    ...defaultSettings,
    connections: [existingConnection],
    activeConnectionId: existingConnection.id,
    kimaiUrl: existingConnection.url,
  };
}

describe("connection settings transaction", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    serviceMocks.loadSettings.mockResolvedValue(initialSettings());
    serviceMocks.saveSettings.mockResolvedValue();
    tokenMocks.getConnectionToken.mockResolvedValue("existing-token");
    tokenMocks.saveConnectionToken.mockResolvedValue();
    tokenMocks.deleteConnectionToken.mockResolvedValue();
  });

  it("commits settings and the secure credential together", async () => {
    const { result } = renderHook(() => useSettings());
    await waitFor(() => expect(result.current.loaded).toBe(true));
    const nextConnection: SavedConnection = {
      id: "connection-b",
      name: "Secondary",
      url: "https://kimai-b.example.test",
    };

    await act(async () => {
      await result.current.saveConnection(nextConnection, "new-token");
    });

    expect(tokenMocks.saveConnectionToken).toHaveBeenCalledWith(
      "connection-b",
      "new-token",
    );
    expect(result.current.settings.connections).toEqual([
      existingConnection,
      nextConnection,
    ]);
    expect(result.current.settings.activeConnectionId).toBe("connection-b");
    expect(result.current.token).toBe("new-token");
  });

  it("rolls settings back when secure credential storage fails", async () => {
    const { result } = renderHook(() => useSettings());
    await waitFor(() => expect(result.current.loaded).toBe(true));
    tokenMocks.saveConnectionToken.mockRejectedValue(
      new Error("OS credential store is unavailable"),
    );
    const nextConnection: SavedConnection = {
      id: "connection-b",
      name: "Secondary",
      url: "https://kimai-b.example.test",
    };
    let failure: unknown;

    await act(async () => {
      try {
        await result.current.saveConnection(nextConnection, "new-token");
      } catch (error) {
        failure = error;
      }
    });

    expect(failure).toBeInstanceOf(Error);
    expect(result.current.settings).toEqual(initialSettings());
    expect(result.current.token).toBe("existing-token");
    expect(serviceMocks.saveSettings).toHaveBeenCalledTimes(2);
    expect(serviceMocks.saveSettings).toHaveBeenLastCalledWith(initialSettings());
  });
});
