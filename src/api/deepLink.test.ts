import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const plugin = vi.hoisted(() => ({
  getCurrent: vi.fn<() => Promise<string[] | null>>(),
  onOpenUrl: vi.fn(),
}));
const log = vi.hoisted(() => ({ error: vi.fn() }));

vi.mock("@tauri-apps/plugin-deep-link", () => plugin);
vi.mock("../utils/logger", () => ({
  logger: log,
}));

describe("deep-link subscription", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.resetAllMocks();
    plugin.getCurrent.mockResolvedValue(null);
    plugin.onOpenUrl.mockResolvedValue(vi.fn());
  });

  afterEach(async () => {
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
    vi.unstubAllGlobals();
  });

  it("delivers a cold-start URL to the subscriber", async () => {
    plugin.getCurrent.mockResolvedValue([
      "kimaitray://start?project=1&activity=2",
    ]);
    const { subscribeToDeepLinks } = await import("./deepLink");
    const subscriber = vi.fn();

    subscribeToDeepLinks(subscriber);

    await vi.waitFor(() => expect(subscriber).toHaveBeenCalledTimes(1));
  });

  it("recovers a cold-start URL stored just after the initial read", async () => {
    const url = "kimaitray://new?issue=https%3A%2F%2Fgit.example.test%2Fgroup%2Fproject%2F-%2Fissues%2F7";
    plugin.getCurrent
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce([url]);
    const { subscribeToDeepLinks } = await import("./deepLink");
    const subscriber = vi.fn();

    subscribeToDeepLinks(subscriber);

    await vi.waitFor(() => expect(subscriber).toHaveBeenCalledWith(url));
    expect(subscriber).toHaveBeenCalledTimes(1);
  });

  it("does not duplicate a URL observed by the live listener during startup", async () => {
    const url = "kimaitray://start?project=1&activity=2";
    plugin.onOpenUrl.mockImplementation(async (handler: (urls: string[]) => void) => {
      handler([url]);
      return vi.fn();
    });
    plugin.getCurrent.mockResolvedValue([url]);
    const { subscribeToDeepLinks } = await import("./deepLink");
    const subscriber = vi.fn();

    subscribeToDeepLinks(subscriber);

    await vi.waitFor(() => expect(plugin.getCurrent).toHaveBeenCalled());
    expect(subscriber).toHaveBeenCalledTimes(1);
  });

  it("keeps the application listener across a subscriber remount", async () => {
    let liveHandler: ((urls: string[]) => void) | undefined;
    plugin.onOpenUrl.mockImplementation(async (handler: (urls: string[]) => void) => {
      liveHandler = handler;
      return vi.fn();
    });
    const { subscribeToDeepLinks } = await import("./deepLink");
    const first = vi.fn();
    const second = vi.fn();

    const unsubscribe = subscribeToDeepLinks(first);
    await vi.waitFor(() => expect(liveHandler).toBeTypeOf("function"));
    unsubscribe();
    subscribeToDeepLinks(second);
    liveHandler?.(["kimaitray://start?project=3&activity=4"]);

    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledTimes(1);
    expect(plugin.onOpenUrl).toHaveBeenCalledTimes(1);
  });

  it("queues live URLs without subscribers and drains them on subscribe", async () => {
    let liveHandler: ((urls: string[]) => void) | undefined;
    plugin.onOpenUrl.mockImplementation(async (handler: (urls: string[]) => void) => { liveHandler = handler; return vi.fn(); });
    const module = await import("./deepLink");
    const first = vi.fn();
    const unsubscribe = module.subscribeToDeepLinks(first);
    await vi.waitFor(() => expect(liveHandler).toBeTypeOf("function"));
    unsubscribe();
    liveHandler?.(["kimaitray://new"]);
    const second = vi.fn();
    module.subscribeToDeepLinks(second);
    expect(second).toHaveBeenCalledWith("kimaitray://new");
  });

  it("does not replay a retained current URL after renderer reload, but delivers a later live repeat", async () => {
    const url = "kimaitray://new?issue=https%3A%2F%2Fgit.example.test%2Fgroup%2Fproject%2F-%2Fissues%2F7";
    const values = new Map<string, string>();
    vi.stubGlobal("sessionStorage", {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
    });
    let liveHandler: ((urls: string[]) => void) | undefined;
    plugin.onOpenUrl.mockImplementation(async (handler: (urls: string[]) => void) => {
      liveHandler = handler;
      return vi.fn();
    });
    plugin.getCurrent.mockResolvedValue([url]);

    const firstModule = await import("./deepLink");
    const firstSubscriber = vi.fn();
    firstModule.subscribeToDeepLinks(firstSubscriber);
    await vi.waitFor(() => expect(firstSubscriber).toHaveBeenCalledWith(url));

    vi.resetModules();
    const reloadedModule = await import("./deepLink");
    const reloadedSubscriber = vi.fn();
    reloadedModule.subscribeToDeepLinks(reloadedSubscriber);
    await vi.waitFor(() => expect(plugin.getCurrent).toHaveBeenCalledTimes(2));
    expect(reloadedSubscriber).not.toHaveBeenCalled();

    liveHandler?.([url]);
    expect(reloadedSubscriber).toHaveBeenCalledTimes(1);
    expect(reloadedSubscriber).toHaveBeenCalledWith(url);
  });

  it("delivers an in-flight same-URL activation after the initial current read is null", async () => {
    const url = "kimaitray://new?issue=https%3A%2F%2Fgit.example.test%2Fgroup%2Fproject%2F-%2Fissues%2F7";
    const values = new Map<string, string>();
    vi.stubGlobal("sessionStorage", {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
    });
    plugin.getCurrent.mockResolvedValue([url]);

    const firstModule = await import("./deepLink");
    firstModule.subscribeToDeepLinks(vi.fn());
    await vi.waitFor(() => expect(plugin.getCurrent).toHaveBeenCalledTimes(1));

    vi.resetModules();
    plugin.getCurrent.mockReset().mockResolvedValueOnce(null).mockResolvedValueOnce([url]);
    const reloadedModule = await import("./deepLink");
    const reloadedSubscriber = vi.fn();
    reloadedModule.subscribeToDeepLinks(reloadedSubscriber);

    await vi.waitFor(() => expect(reloadedSubscriber).toHaveBeenCalledWith(url));
    expect(reloadedSubscriber).toHaveBeenCalledTimes(1);
  });

  it("logs initialization failures and retries on the next subscription", async () => {
    plugin.onOpenUrl.mockRejectedValueOnce(new Error("plugin")).mockResolvedValueOnce(vi.fn());
    const { subscribeToDeepLinks } = await import("./deepLink");
    const unsubscribe = subscribeToDeepLinks(vi.fn());
    await vi.waitFor(() => expect(log.error).toHaveBeenCalledWith(expect.stringContaining("Failed to initialize")));
    unsubscribe();
    subscribeToDeepLinks(vi.fn());
    await vi.waitFor(() => expect(plugin.onOpenUrl).toHaveBeenCalledTimes(2));
  });
});
