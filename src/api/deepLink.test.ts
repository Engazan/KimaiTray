import { beforeEach, describe, expect, it, vi } from "vitest";

const plugin = vi.hoisted(() => ({
  getCurrent: vi.fn<() => Promise<string[] | null>>(),
  onOpenUrl: vi.fn(),
}));

vi.mock("@tauri-apps/plugin-deep-link", () => plugin);
vi.mock("../utils/logger", () => ({
  logger: { error: vi.fn() },
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
});
