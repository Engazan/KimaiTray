// @vitest-environment jsdom

import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AppSettings, SavedConnection } from "../types";

const serviceMocks = vi.hoisted(() => ({
  loadSettings: vi.fn<() => Promise<AppSettings>>(),
  patchSettings: vi.fn<
    (
      settings: Partial<AppSettings>,
      expected?: Partial<AppSettings>,
    ) => Promise<AppSettings>
  >(),
}));
const tokenMocks = vi.hoisted(() => ({
  getConnectionToken: vi.fn<() => Promise<string | null>>(),
  saveConnectionToken: vi.fn<() => Promise<void>>(),
  deleteConnectionToken: vi.fn<() => Promise<void>>(),
  deleteIssueToken: vi.fn<() => Promise<void>>(),
}));

vi.mock("./service", async () => {
  const actual = await vi.importActual<typeof import("./service")>("./service");
  return {
    ...actual,
    loadSettings: serviceMocks.loadSettings,
    patchSettings: serviceMocks.patchSettings,
  };
});
vi.mock("../api/connectionTokenStore", () => tokenMocks);
vi.mock("../integrations/issues/issueTokenStore", () => ({
  deleteIssueToken: tokenMocks.deleteIssueToken,
}));

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
    serviceMocks.patchSettings.mockResolvedValue(initialSettings());
    tokenMocks.getConnectionToken.mockResolvedValue("existing-token");
    tokenMocks.saveConnectionToken.mockResolvedValue();
    tokenMocks.deleteConnectionToken.mockResolvedValue();
    tokenMocks.deleteIssueToken.mockResolvedValue();
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

  it("persists an individual preference as an atomic field patch", async () => {
    const { result } = renderHook(() => useSettings());
    await waitFor(() => expect(result.current.loaded).toBe(true));

    act(() => result.current.update("theme", "dark"));

    await waitFor(() =>
      expect(serviceMocks.patchSettings).toHaveBeenCalledWith({ theme: "dark" }),
    );
    expect(result.current.settings.theme).toBe("dark");
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
    expect(serviceMocks.patchSettings).toHaveBeenCalledTimes(2);
    expect(serviceMocks.patchSettings).toHaveBeenLastCalledWith(
      {
        connections: initialSettings().connections,
        activeConnectionId: initialSettings().activeConnectionId,
        kimaiUrl: initialSettings().kimaiUrl,
      },
      {
        connections: [
          existingConnection,
          {
            id: "connection-b",
            name: "Secondary",
            url: "https://kimai-b.example.test",
          },
        ],
        activeConnectionId: "connection-b",
        kimaiUrl: "https://kimai-b.example.test",
      },
    );
  });

  it("removes both Kimai and issue credentials with a connection", async () => {
    const { result } = renderHook(() => useSettings());
    await waitFor(() => expect(result.current.loaded).toBe(true));

    await act(async () => result.current.removeConnection("connection-a"));

    expect(tokenMocks.deleteConnectionToken).toHaveBeenCalledWith("connection-a");
    expect(tokenMocks.deleteIssueToken).toHaveBeenCalledWith("connection-a");
    expect(result.current.settings.connections).toEqual([]);
    expect(result.current.token).toBe("");
  });

  it("keeps a connection removed when credential cleanup is incomplete", async () => {
    const { result, unmount } = renderHook(() => useSettings());
    await waitFor(() => expect(result.current.loaded).toBe(true));
    tokenMocks.deleteIssueToken.mockRejectedValue(new Error("keyring locked"));
    let resultValue: { credentialCleanupPending: boolean } | undefined;

    await act(async () => {
      resultValue = await result.current.removeConnection("connection-a");
    });

    expect(resultValue).toEqual({ credentialCleanupPending: true });
    expect(result.current.settings.connections).toEqual([]);
    expect(result.current.settings.activeConnectionId).toBe("");
    expect(result.current.token).toBe("");
    expect(serviceMocks.patchSettings).toHaveBeenCalledTimes(1);

    unmount();
    tokenMocks.deleteIssueToken.mockResolvedValue();
    renderHook(() => useSettings());
    await waitFor(() =>
      expect(tokenMocks.deleteIssueToken).toHaveBeenCalledTimes(2),
    );
  });
});
