// @vitest-environment jsdom

import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AppSettings } from "../types";

const serviceMocks = vi.hoisted(() => ({
  loadSettings: vi.fn<() => Promise<AppSettings>>(),
  saveSettings: vi.fn<() => Promise<void>>(),
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
    serviceMocks.onSettingsChange.mockImplementation(
      (listener: (settings: AppSettings) => void) => {
        serviceMocks.listener = listener;
        return Promise.resolve(() => {});
      },
    );
    credentialMocks.getConnectionToken.mockImplementation(
      async (id: string) => `kimai-token-${id}`,
    );
    credentialMocks.getIssueToken.mockResolvedValue("issue-token-a");
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
});
