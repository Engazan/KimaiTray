import { beforeEach, describe, expect, it, vi } from "vitest";

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
