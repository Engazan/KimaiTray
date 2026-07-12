// @vitest-environment jsdom

import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AppSettings } from "../types";

const serviceMocks = vi.hoisted(() => ({
  loadSettings: vi.fn<() => Promise<AppSettings>>(),
  saveSettings: vi.fn<() => Promise<void>>(),
  patchSettings: vi.fn<
    (values: Partial<AppSettings>) => Promise<AppSettings>
  >(),
  onSettingsChange: vi.fn(),
  listener: null as ((settings: AppSettings) => void) | null,
}));
const credentialMocks = vi.hoisted(() => ({
  getConnectionToken: vi.fn(),
  getIssueToken: vi.fn(),
}));

vi.mock("../settings/service", async () => {
  const actual = await vi.importActual<typeof import("../settings/service")>(
    "../settings/service",
  );
  return {
    ...actual,
    loadSettings: serviceMocks.loadSettings,
    saveSettings: serviceMocks.saveSettings,
    patchSettings: serviceMocks.patchSettings,
    onSettingsChange: serviceMocks.onSettingsChange,
  };
});
vi.mock("../api/connectionTokenStore", () => ({
  getConnectionToken: credentialMocks.getConnectionToken,
}));
vi.mock("../integrations/issues/issueTokenStore", () => ({
  getIssueToken: credentialMocks.getIssueToken,
}));
vi.mock("@tauri-apps/api/window", () => ({
  getCurrentWindow: () => ({
    onFocusChanged: vi.fn(async () => () => {}),
    listen: vi.fn(async () => () => {}),
  }),
}));

import { defaultSettings } from "../settings/service";
import { useKimaiClient } from "./useKimaiClient";

function settingsFor(id: string): AppSettings {
  const url = `https://${id}.example.test`;
  return {
    ...defaultSettings,
    kimaiUrl: url,
    activeConnectionId: id,
    connections: [{ id, name: id, url }],
    issueIntegrations: {
      [id]: {
        enabled: true,
        provider: "gitlab",
        baseUrl: `https://git-${id}.example.test`,
        apiBaseUrl: "",
        projectPathOrRepo: "group/project",
        defaultState: "opened",
        assigneeOnly: false,
        syncTime: false,
        autoInsertUrl: false,
        showTimeEstimate: true,
        filterLabels: [],
        filterLabelsMode: "include",
      },
    },
  };
}

describe("Kimai connection session isolation", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    serviceMocks.listener = null;
    serviceMocks.loadSettings.mockResolvedValue(settingsFor("connection-a"));
    serviceMocks.saveSettings.mockResolvedValue();
    serviceMocks.patchSettings.mockImplementation(async (values) => ({
      ...(await serviceMocks.loadSettings()),
      ...values,
    }));
    serviceMocks.onSettingsChange.mockImplementation(
      (listener: (settings: AppSettings) => void) => {
        serviceMocks.listener = listener;
        return Promise.resolve(() => {});
      },
    );
    credentialMocks.getConnectionToken.mockImplementation(
      async (id: string) => `kimai-token-${id}`,
    );
    credentialMocks.getIssueToken.mockImplementation(
      async (id: string) => `issue-token-${id.replace("connection-", "")}`,
    );
  });

  it("clears the previous issue token while the next token is loading", async () => {
    const { result } = renderHook(() => useKimaiClient());
    await waitFor(() => expect(result.current.issueToken).toBe("issue-token-a"));

    let resolveIssueToken!: (value: string) => void;
    credentialMocks.getIssueToken.mockImplementationOnce(
      () =>
        new Promise<string>((resolve) => {
          resolveIssueToken = resolve;
        }),
    );
    act(() => serviceMocks.listener?.(settingsFor("connection-b")));

    await waitFor(() =>
      expect(result.current.activeConnectionId).toBe("connection-b"),
    );
    expect(result.current.issueToken).toBeNull();

    await act(async () => resolveIssueToken("issue-token-b"));
    await waitFor(() => expect(result.current.issueToken).toBe("issue-token-b"));
  });

  it("rotates the cache scope when credentials change on the same connection", async () => {
    const settings = settingsFor("connection-a");
    const { result } = renderHook(() => useKimaiClient());
    await waitFor(() => expect(result.current.client).not.toBeNull());
    const initialScope = result.current.client!.cacheScope;

    credentialMocks.getConnectionToken.mockResolvedValueOnce("rotated-token");
    act(() => serviceMocks.listener?.(settings));

    await waitFor(() =>
      expect(result.current.client?.cacheScope).not.toBe(initialScope),
    );
    expect(result.current.client?.connectionId).toBe("connection-a");
    expect(result.current.client?.cacheScope).not.toContain("rotated-token");
  });

  it("keeps the previous session active until a switch is persisted", async () => {
    const connectionA = settingsFor("connection-a");
    const connectionB = settingsFor("connection-b");
    const settings = {
      ...connectionA,
      connections: [
        ...connectionA.connections,
        ...connectionB.connections,
      ],
      issueIntegrations: {
        ...connectionA.issueIntegrations,
        ...connectionB.issueIntegrations,
      },
    };
    serviceMocks.loadSettings.mockResolvedValue(settings);

    let persistSwitch!: (settings: AppSettings) => void;
    serviceMocks.patchSettings.mockImplementationOnce(
      () =>
        new Promise<AppSettings>((resolve) => {
          persistSwitch = resolve;
        }),
    );

    const { result } = renderHook(() => useKimaiClient());
    await waitFor(() =>
      expect(result.current.client?.connectionId).toBe("connection-a"),
    );

    let switchPromise!: Promise<void>;
    act(() => {
      switchPromise = result.current.switchConnection("connection-b");
    });
    await waitFor(() => expect(serviceMocks.patchSettings).toHaveBeenCalled());

    expect(result.current.activeConnectionId).toBe("connection-a");
    expect(result.current.client?.connectionId).toBe("connection-a");
    expect(result.current.issueToken).toBe("issue-token-a");

    await act(async () => {
      persistSwitch({
        ...settings,
        activeConnectionId: "connection-b",
        kimaiUrl: connectionB.kimaiUrl,
      });
      await switchPromise;
    });

    await waitFor(() =>
      expect(result.current.client?.connectionId).toBe("connection-b"),
    );
    expect(result.current.issueToken).toBe("issue-token-b");
  });
});
