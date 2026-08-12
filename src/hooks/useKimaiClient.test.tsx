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
const windowMocks = vi.hoisted(() => ({
  onFocusChanged: vi.fn(),
  listen: vi.fn(),
  unlistenFocus: vi.fn(),
  unlistenShow: vi.fn(),
  focusListener: null as null | ((event: { payload: boolean }) => void),
  showListener: null as null | (() => void),
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
    onFocusChanged: windowMocks.onFocusChanged,
    listen: windowMocks.listen,
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
    plugins: {
      [id]: {
        creativeIssueLink: id === "connection-a",
      },
    },
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
    windowMocks.focusListener = null;
    windowMocks.showListener = null;
    windowMocks.onFocusChanged.mockImplementation(async (listener) => {
      windowMocks.focusListener = listener;
      return windowMocks.unlistenFocus;
    });
    windowMocks.listen.mockImplementation(async (_event, listener) => {
      windowMocks.showListener = listener;
      return windowMocks.unlistenShow;
    });
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

  it("keeps the session ready while refreshing the same connection", async () => {
    const { result } = renderHook(() => useKimaiClient());
    await waitFor(() => expect(result.current.settingsReady).toBe(true));

    let resolveToken!: (value: string) => void;
    credentialMocks.getConnectionToken.mockImplementationOnce(
      () =>
        new Promise<string>((resolve) => {
          resolveToken = resolve;
        }),
    );

    act(() => serviceMocks.listener?.(settingsFor("connection-a")));
    await waitFor(() => expect(credentialMocks.getConnectionToken).toHaveBeenCalledTimes(2));

    expect(result.current.settingsReady).toBe(true);
    expect(result.current.client?.connectionId).toBe("connection-a");

    await act(async () => resolveToken("refreshed-token"));
    await waitFor(() => expect(result.current.client?.cacheScope).toContain("connection-a"));
  });

  it("applies Creative issue link settings per connection", async () => {
    const { result } = renderHook(() => useKimaiClient());
    await waitFor(() =>
      expect(result.current.pluginFlags.creativeIssueLink).toBe(true),
    );

    act(() => serviceMocks.listener?.(settingsFor("connection-b")));

    await waitFor(() =>
      expect(result.current.pluginFlags.creativeIssueLink).toBe(false),
    );
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

  it("exposes defaults for missing connection-scoped settings", async () => {
    serviceMocks.loadSettings.mockResolvedValue({
      ...settingsFor("connection-a"),
      popupLayout: undefined,
      colorMode: undefined,
      displayMode: undefined,
      connections: undefined,
      activeConnectionId: undefined,
      features: undefined,
      plugins: undefined,
      issueIntegrations: undefined,
      kimaiUrl: "",
    } as unknown as AppSettings);

    const { result } = renderHook(() => useKimaiClient());
    await waitFor(() => expect(result.current.settingsReady).toBe(true));

    expect(result.current.client).toBeNull();
    expect(result.current.isConfigured).toBe(false);
    expect(result.current.connections).toEqual([]);
    expect(result.current.popupLayout).toBe("classic");
    expect(result.current.colorMode).toBe("kimai");
    expect(result.current.displayMode).toBe("tray");
    expect(result.current.issueIntegration.enabled).toBe(false);
    expect(result.current.issueToken).toBeNull();
  });

  it("recovers from credential lookup failures", async () => {
    credentialMocks.getIssueToken.mockRejectedValueOnce(new Error("issue"));
    credentialMocks.getConnectionToken.mockRejectedValueOnce(new Error("kimai"));
    const { result } = renderHook(() => useKimaiClient());

    await waitFor(() => expect(result.current.settingsReady).toBe(true));
    expect(result.current.issueToken).toBeNull();
    expect(result.current.client).toBeNull();
  });

  it("ignores stale credential results after newer settings", async () => {
    let resolveOldIssue!: (value: string) => void;
    credentialMocks.getIssueToken.mockImplementationOnce(() => new Promise((resolve) => {
      resolveOldIssue = resolve;
    }));
    const { result } = renderHook(() => useKimaiClient());

    await waitFor(() => expect(credentialMocks.getIssueToken).toHaveBeenCalledTimes(1));
    act(() => serviceMocks.listener?.(settingsFor("connection-b")));
    await waitFor(() => expect(result.current.issueToken).toBe("issue-token-b"));
    await act(async () => resolveOldIssue("stale"));
    expect(result.current.issueToken).toBe("issue-token-b");
  });

  it("reloads on focus and show, then unregisters listeners", async () => {
    const { result, unmount } = renderHook(() => useKimaiClient());
    await waitFor(() => expect(result.current.settingsReady).toBe(true));
    const initialLoads = serviceMocks.loadSettings.mock.calls.length;

    act(() => windowMocks.focusListener?.({ payload: false }));
    expect(serviceMocks.loadSettings).toHaveBeenCalledTimes(initialLoads);
    act(() => windowMocks.focusListener?.({ payload: true }));
    act(() => windowMocks.showListener?.());
    await waitFor(() => expect(serviceMocks.loadSettings.mock.calls.length).toBe(initialLoads + 2));

    unmount();
    await Promise.resolve();
    expect(windowMocks.unlistenFocus).toHaveBeenCalled();
    expect(windowMocks.unlistenShow).toHaveBeenCalled();
  });

  it("ignores missing/current connections and survives persistence failures", async () => {
    const { result } = renderHook(() => useKimaiClient());
    await waitFor(() => expect(result.current.settingsReady).toBe(true));

    await act(async () => result.current.switchConnection("missing"));
    await act(async () => result.current.switchConnection("connection-a"));
    expect(serviceMocks.patchSettings).not.toHaveBeenCalled();

    const a = settingsFor("connection-a");
    const b = settingsFor("connection-b").connections[0];
    serviceMocks.loadSettings.mockResolvedValue({ ...a, connections: [...a.connections, b] });
    serviceMocks.patchSettings.mockRejectedValueOnce(new Error("persist"));
    await act(async () => result.current.switchConnection("connection-b"));
    expect(result.current.activeConnectionId).toBe("connection-a");
  });

  it("ignores stale rejected issue credentials", async () => {
    let rejectOld!: (error: Error) => void;
    credentialMocks.getIssueToken.mockImplementationOnce(() => new Promise((_resolve, reject) => {
      rejectOld = reject;
    }));
    const { result } = renderHook(() => useKimaiClient());
    await waitFor(() => expect(credentialMocks.getIssueToken).toHaveBeenCalledTimes(1));
    act(() => serviceMocks.listener?.(settingsFor("connection-b")));
    await waitFor(() => expect(result.current.issueToken).toBe("issue-token-b"));
    await act(async () => rejectOld(new Error("stale")));
    expect(result.current.issueToken).toBe("issue-token-b");
  });

  it.each(["resolve", "reject"])("ignores stale %s connection credentials", async (outcome) => {
    let settleOld!: () => void;
    credentialMocks.getConnectionToken.mockImplementationOnce(() => new Promise((resolve, reject) => {
      settleOld = () => outcome === "resolve" ? resolve("stale") : reject(new Error("stale"));
    }));
    const { result } = renderHook(() => useKimaiClient());
    await waitFor(() => expect(credentialMocks.getConnectionToken).toHaveBeenCalledTimes(1));
    act(() => serviceMocks.listener?.(settingsFor("connection-b")));
    await waitFor(() => expect(result.current.client?.connectionId).toBe("connection-b"));
    await act(async () => settleOld());
    expect(result.current.client?.connectionId).toBe("connection-b");
  });

  it("ignores stale switch reads and writes", async () => {
    const a = settingsFor("connection-a");
    const b = settingsFor("connection-b");
    const both = { ...a, connections: [...a.connections, ...b.connections] };
    const { result } = renderHook(() => useKimaiClient());
    await waitFor(() => expect(result.current.settingsReady).toBe(true));

    let resolveRead!: (settings: AppSettings) => void;
    serviceMocks.loadSettings.mockImplementationOnce(() => new Promise((resolve) => { resolveRead = resolve; }));
    let switching!: Promise<void>;
    act(() => { switching = result.current.switchConnection("connection-b"); });
    act(() => serviceMocks.listener?.(a));
    await act(async () => resolveRead(both));
    await switching;
    expect(serviceMocks.patchSettings).not.toHaveBeenCalled();

    serviceMocks.loadSettings.mockResolvedValue(both);
    let resolveWrite!: (settings: AppSettings) => void;
    serviceMocks.patchSettings.mockImplementationOnce(() => new Promise((resolve) => { resolveWrite = resolve; }));
    act(() => { switching = result.current.switchConnection("connection-b"); });
    await waitFor(() => expect(serviceMocks.patchSettings).toHaveBeenCalledTimes(1));
    act(() => serviceMocks.listener?.(a));
    await act(async () => resolveWrite({ ...both, activeConnectionId: "connection-b", kimaiUrl: b.kimaiUrl }));
    await switching;
    expect(result.current.activeConnectionId).toBe("connection-a");
  });
});
