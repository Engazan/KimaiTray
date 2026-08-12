// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  label: "main",
  render: vi.fn(),
  createRoot: vi.fn(),
  platform: vi.fn(),
  init: Promise.resolve(),
  logger: vi.fn(),
}));

vi.mock("react-dom/client", () => ({ default: { createRoot: mocks.createRoot } }));
vi.mock("@tauri-apps/api/window", () => ({ getCurrentWindow: () => ({ label: mocks.label }) }));
vi.mock("./shared/i18n", () => ({ initPromise: mocks.init }));
vi.mock("./platform", () => ({ getPlatformInfo: mocks.platform }));
vi.mock("./utils/logger", () => ({ logger: { error: mocks.logger } }));
vi.mock("./components/ErrorBoundary", () => ({ ErrorBoundary: ({ children }: any) => children }));
vi.mock("./providers/QueryProvider", () => ({ default: ({ children }: any) => children }));
vi.mock("./windows/Settings", () => ({ default: () => <div>settings-window</div> }));
vi.mock("./windows/TimerReminder", () => ({ default: () => <div>reminder-window</div> }));
vi.mock("./windows/Changelog", () => ({ default: () => <div>changelog-window</div> }));
vi.mock("./windows/TrayPopup", () => ({ default: () => <div>tray-window</div> }));

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  document.body.innerHTML = '<div id="root"></div>';
  mocks.label = "main";
  mocks.createRoot.mockReturnValue({ render: mocks.render });
  mocks.platform.mockResolvedValue({
    os: "linux",
    session: "wayland",
    trayBackend: "appindicator",
    supportsNativePopupCorners: true,
  });
});

describe("application bootstrap", () => {
  it.each([
    ["settings", "settings-window"],
    ["timer-reminder", "reminder-window"],
    ["changelog", "changelog-window"],
    ["main", "tray-window"],
  ])("renders the %s entry point", async (label, marker) => {
    mocks.label = label;
    await import("./main");
    await vi.waitFor(() => expect(mocks.render).toHaveBeenCalled());
    const tree = mocks.render.mock.calls[0][0];
    const windowElement = tree.props.children.props.children.props.children;
    expect(windowElement.type().props.children).toBe(marker);
    expect(document.documentElement.dataset.window).toBe(label);
    expect(document.documentElement.dataset.os).toBe("linux");
    expect(document.documentElement.dataset.session).toBe("wayland");
    expect(document.documentElement.dataset.trayBackend).toBe("appindicator");
    expect(document.documentElement.dataset.nativePopupCorners).toBe("true");
  });

  it("logs bootstrap failures", async () => {
    mocks.platform.mockRejectedValue(new Error("platform failed"));
    await import("./main");
    await vi.waitFor(() => expect(mocks.logger).toHaveBeenCalledWith("Failed to initialize application: Error: platform failed"));
    expect(mocks.render).not.toHaveBeenCalled();
  });

  it("logs unhandled promise rejections and browser errors", async () => {
    await import("./main");
    window.dispatchEvent(new Event("unhandledrejection", { bubbles: false }));
    const rejection = new Event("unhandledrejection") as PromiseRejectionEvent;
    Object.defineProperty(rejection, "reason", { value: "boom" });
    window.dispatchEvent(rejection);
    window.dispatchEvent(new ErrorEvent("error", { message: "broken", filename: "app.js", lineno: 12 }));
    expect(mocks.logger).toHaveBeenCalledWith("Unhandled promise rejection: boom");
    expect(mocks.logger).toHaveBeenCalledWith("Uncaught error: broken at app.js:12");
  });
});
