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

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((done, fail) => {
    resolve = done;
    reject = fail;
  });
  return { promise, resolve, reject };
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

  it("rolls back only the preference whose latest persistence failed", async () => {
    const { result } = renderHook(() => useSettings());
    await waitFor(() => expect(result.current.loaded).toBe(true));
    serviceMocks.patchSettings.mockRejectedValueOnce(new Error("disk unavailable"));

    act(() => result.current.update("theme", "dark"));

    await waitFor(() => expect(result.current.settings.theme).toBe("light"));
  });

  it("restores the previous token when secure persistence fails", async () => {
    const { result } = renderHook(() => useSettings());
    await waitFor(() => expect(result.current.loaded).toBe(true));
    tokenMocks.saveConnectionToken.mockRejectedValueOnce(
      new Error("keyring unavailable"),
    );

    await act(async () => result.current.updateToken("replacement-token"));

    expect(result.current.token).toBe("existing-token");
  });

  it("publishes an activated connection only after persistence succeeds", async () => {
    const secondary: SavedConnection = {
      id: "connection-b",
      name: "Secondary",
      url: "https://kimai-b.example.test",
    };
    const initial = {
      ...initialSettings(),
      connections: [existingConnection, secondary],
    };
    serviceMocks.loadSettings.mockResolvedValue(initial);
    tokenMocks.getConnectionToken.mockImplementation(
      async (id?: string) => `token-${id}`,
    );
    const persistence = deferred<AppSettings>();
    serviceMocks.patchSettings.mockReturnValueOnce(persistence.promise);
    const { result } = renderHook(() => useSettings());
    await waitFor(() => expect(result.current.loaded).toBe(true));

    let activation!: Promise<void>;
    act(() => {
      activation = result.current.activateConnection("connection-b");
    });
    expect(result.current.settings.activeConnectionId).toBe("connection-a");
    expect(result.current.token).toBe("token-connection-a");

    await act(async () => {
      persistence.resolve({
        ...initial,
        activeConnectionId: "connection-b",
        kimaiUrl: secondary.url,
      });
      await activation;
    });

    expect(result.current.settings.activeConnectionId).toBe("connection-b");
    expect(result.current.token).toBe("token-connection-b");
  });

  it("rolls settings back when secure credential storage fails", async () => {
    const { result } = renderHook(() => useSettings());
    await waitFor(() => expect(result.current.loaded).toBe(true));
    tokenMocks.saveConnectionToken.mockRejectedValue(
      new Error("OS credential store is unavailable"),
    );
    serviceMocks.patchSettings
      .mockResolvedValueOnce(initialSettings())
      .mockRejectedValueOnce(new Error("rollback storage unavailable"));
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

    expect(tokenMocks.deleteConnectionToken).toHaveBeenCalledWith(
      "connection-a",
      "https://kimai-a.example.test",
    );
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
    const retry = deferred<void>();
    tokenMocks.deleteIssueToken.mockReturnValueOnce(retry.promise);
    renderHook(() => useSettings());
    await waitFor(() =>
      expect(tokenMocks.deleteIssueToken).toHaveBeenCalledTimes(2),
    );
    renderHook(() => useSettings());
    expect(tokenMocks.deleteIssueToken).toHaveBeenCalledTimes(2);
    await act(async () => retry.resolve());
  });

  it("supports clearing a token and connections without an id", async () => {
    const { result } = renderHook(() => useSettings());
    await waitFor(() => expect(result.current.loaded).toBe(true));
    await act(async () => result.current.updateToken(""));
    expect(tokenMocks.deleteConnectionToken).toHaveBeenCalledWith("connection-a");

    serviceMocks.loadSettings.mockResolvedValue({ ...initialSettings(), activeConnectionId: "", kimaiUrl: "", connections: [] });
    const empty = renderHook(() => useSettings());
    await waitFor(() => expect(empty.result.current.loaded).toBe(true));
    vi.clearAllMocks();
    await act(async () => empty.result.current.updateToken("local-only"));
    expect(tokenMocks.saveConnectionToken).not.toHaveBeenCalled();
    expect(empty.result.current.token).toBe("local-only");
  });

  it("does not roll an older failed preference or token over newer state", async () => {
    const { result } = renderHook(() => useSettings());
    await waitFor(() => expect(result.current.loaded).toBe(true));
    let rejectTheme!: (error: Error) => void;
    serviceMocks.patchSettings.mockImplementationOnce(() => new Promise((_resolve, reject) => { rejectTheme = reject; }));
    act(() => result.current.update("theme", "dark"));
    act(() => result.current.update("theme", "transparent"));
    await act(async () => rejectTheme(new Error("old")));
    expect(result.current.settings.theme).toBe("transparent");

    let rejectToken!: (error: Error) => void;
    tokenMocks.saveConnectionToken.mockImplementationOnce(() => new Promise((_resolve, reject) => { rejectToken = reject; }));
    let oldWrite!: Promise<void>;
    act(() => { oldWrite = result.current.updateToken("old"); });
    await act(async () => result.current.updateToken("new"));
    await act(async () => rejectToken(new Error("old")));
    await oldWrite;
    expect(result.current.token).toBe("new");
  });

  it("loads null and failed tokens as empty values", async () => {
    tokenMocks.getConnectionToken.mockResolvedValueOnce(null);
    const empty = renderHook(() => useSettings());
    await waitFor(() => expect(empty.result.current.loaded).toBe(true));
    expect(empty.result.current.token).toBe("");
    empty.unmount();

    tokenMocks.getConnectionToken.mockRejectedValueOnce(new Error("keyring"));
    const failed = renderHook(() => useSettings());
    await waitFor(() => expect(failed.result.current.loaded).toBe(true));
    expect(failed.result.current.token).toBe("");
  });

  it.each(["resolve", "reject"] as const)(
    "ignores a stale token load that later %ss",
    async (outcome) => {
      const secondary: SavedConnection = {
        id: "connection-b",
        name: "Secondary",
        url: "https://kimai-b.example.test",
      };
      serviceMocks.loadSettings.mockResolvedValue({
        ...initialSettings(),
        connections: [existingConnection, secondary],
      });
      const stale = deferred<string | null>();
      tokenMocks.getConnectionToken
        .mockReturnValueOnce(stale.promise)
        .mockResolvedValueOnce("secondary-token");
      const { result } = renderHook(() => useSettings());
      await waitFor(() =>
        expect(result.current.settings.activeConnectionId).toBe("connection-a"),
      );

      await act(async () => result.current.removeConnection("connection-a"));
      expect(result.current.token).toBe("secondary-token");
      await act(async () => {
        if (outcome === "resolve") stale.resolve("stale-token");
        else stale.reject(new Error("stale keyring failure"));
      });

      expect(result.current.token).toBe("secondary-token");
      expect(result.current.loaded).toBe(true);
    },
  );

  it("edits a connection and deletes its token when the new token is empty", async () => {
    const { result } = renderHook(() => useSettings());
    await waitFor(() => expect(result.current.loaded).toBe(true));
    const edited = { ...existingConnection, name: "Renamed", url: "https://new.example.test" };
    await act(async () => result.current.saveConnection(edited, ""));
    expect(result.current.settings.connections).toEqual([edited]);
    expect(tokenMocks.deleteConnectionToken).toHaveBeenCalledWith("connection-a");
  });

  it("removes an inactive connection without changing the active token", async () => {
    const secondary = { id: "connection-b", name: "B", url: existingConnection.url };
    serviceMocks.loadSettings.mockResolvedValue({ ...initialSettings(), connections: [existingConnection, secondary] });
    const { result } = renderHook(() => useSettings());
    await waitFor(() => expect(result.current.loaded).toBe(true));
    await act(async () => result.current.removeConnection("connection-b"));
    expect(result.current.settings.activeConnectionId).toBe("connection-a");
    expect(result.current.token).toBe("existing-token");
    expect(tokenMocks.deleteConnectionToken).toHaveBeenCalledWith("connection-b", undefined);
  });

  it("activates the next connection when the active one is removed", async () => {
    const secondary = { id: "connection-b", name: "B", url: "https://b.example.test" };
    serviceMocks.loadSettings.mockResolvedValue({ ...initialSettings(), connections: [existingConnection, secondary] });
    tokenMocks.getConnectionToken.mockImplementation(async (id?: string) => `token-${id}`);
    const { result } = renderHook(() => useSettings());
    await waitFor(() => expect(result.current.loaded).toBe(true));
    await act(async () => result.current.removeConnection("connection-a"));
    expect(result.current.settings.activeConnectionId).toBe("connection-b");
    expect(result.current.token).toBe("token-connection-b");
  });

  it("ignores missing/current and stale activation requests", async () => {
    const secondary = { id: "connection-b", name: "B", url: "https://b.example.test" };
    const initial = { ...initialSettings(), connections: [existingConnection, secondary] };
    serviceMocks.loadSettings.mockResolvedValue(initial);
    const { result } = renderHook(() => useSettings());
    await waitFor(() => expect(result.current.loaded).toBe(true));
    await act(async () => result.current.activateConnection("missing"));
    await act(async () => result.current.activateConnection("connection-a"));
    expect(serviceMocks.patchSettings).not.toHaveBeenCalled();

    const first = deferred<AppSettings>();
    serviceMocks.patchSettings.mockReturnValueOnce(first.promise).mockResolvedValueOnce({ ...initial, activeConnectionId: "connection-a" });
    let old!: Promise<void>;
    act(() => { old = result.current.activateConnection("connection-b"); });
    await act(async () => result.current.activateConnection("connection-b"));
    await act(async () => first.resolve({ ...initial, activeConnectionId: "connection-b", kimaiUrl: secondary.url }));
    await old;
    expect(result.current.settings.activeConnectionId).toBe("connection-a");
  });
});
