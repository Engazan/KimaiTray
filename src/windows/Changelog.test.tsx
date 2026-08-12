// @vitest-environment jsdom

import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import Changelog from "./Changelog";
import { defaultSettings } from "../settings/service";

const mocks = vi.hoisted(() => ({
  queued: null as any,
  readQueued: vi.fn(), forget: vi.fn(), loadSettings: vi.fn(), onSettingsChange: vi.fn(),
  hide: vi.fn(), show: vi.fn(), focus: vi.fn(), listen: vi.fn(), event: null as null | ((event: any) => void),
  settingsListener: null as null | ((settings: any) => void), logger: vi.fn(),
}));
vi.mock("../api/changelog", () => ({
  readQueuedChangelogWindow: () => mocks.readQueued(),
  forgetQueuedChangelogWindow: mocks.forget,
}));
vi.mock("../api/changelogWindow", () => ({ CHANGELOG_SHOW_EVENT: "show-changelog" }));
vi.mock("../settings/service", async (importOriginal) => {
  const actual = await importOriginal<any>();
  return { ...actual, loadSettings: mocks.loadSettings, onSettingsChange: (cb: any) => { mocks.settingsListener = cb; return mocks.onSettingsChange(cb); } };
});
vi.mock("@tauri-apps/api/window", () => ({ getCurrentWindow: () => ({
  hide: mocks.hide, show: mocks.show, setFocus: mocks.focus,
  listen: (_name: string, cb: any) => { mocks.event = cb; mocks.listen(); return Promise.resolve(vi.fn()); },
}) }));
vi.mock("../hooks/useLanguageSync", () => ({ useLanguageSync: vi.fn() }));
vi.mock("../utils/logger", () => ({ logger: { error: mocks.logger } }));
vi.mock("../components/ChangelogDialog", () => ({ default: ({ version, body, onClose }: any) => <div data-testid="dialog">{version}:{body}<button onClick={onClose}>close</button></div> }));

beforeEach(() => {
  vi.clearAllMocks(); mocks.event = null; mocks.settingsListener = null; mocks.queued = null;
  mocks.readQueued.mockImplementation(() => mocks.queued);
  mocks.loadSettings.mockResolvedValue({ ...defaultSettings, theme: "dark", accentStyle: "purple", reduceVisualEffects: true });
  mocks.onSettingsChange.mockResolvedValue(vi.fn());
  mocks.hide.mockResolvedValue(undefined); mocks.show.mockResolvedValue(undefined); mocks.focus.mockResolvedValue(undefined);
  vi.spyOn(window, "requestAnimationFrame").mockImplementation((cb) => { cb(0); return 1; });
  vi.spyOn(window, "cancelAnimationFrame").mockImplementation(() => {});
  vi.stubGlobal("matchMedia", vi.fn(() => ({ matches: true })));
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe("Changelog window", () => {
  it("hides when empty and applies initial and loaded appearance", async () => {
    render(<Changelog />);
    await waitFor(() => expect(mocks.hide).toHaveBeenCalled());
    await waitFor(() => expect(document.documentElement.classList.contains("dark")).toBe(true));
    expect(document.documentElement.dataset.accent).toBe("purple");
    expect(document.documentElement.dataset.reduceMotion).toBe("true");
  });

  it("shows queued content, focuses the window and closes it", async () => {
    const user = userEvent.setup();
    mocks.queued = { version: "2.0", body: "Changes" };
    render(<Changelog />);
    expect(screen.getByTestId("dialog").textContent).toContain("2.0:Changes");
    await waitFor(() => expect(mocks.focus).toHaveBeenCalled());
    expect(mocks.forget).toHaveBeenCalledWith(mocks.queued);
    await user.click(screen.getByRole("button", { name: "close" }));
    expect(screen.queryByTestId("dialog")).toBeNull();
    expect(mocks.hide).toHaveBeenCalled();
  });

  it("responds to show events and live appearance changes", async () => {
    render(<Changelog />);
    act(() => mocks.event?.({ payload: { version: "3.0", body: "New" } }));
    expect(await screen.findByText(/3.0:New/)).toBeTruthy();
    act(() => mocks.settingsListener?.({ ...defaultSettings, theme: "transparent", accentStyle: "red" }));
    expect(document.documentElement.classList.contains("dark")).toBe(true);
    expect(document.documentElement.dataset.accent).toBe("red");
  });

  it("logs failures to hide or show the window", async () => {
    mocks.hide.mockRejectedValueOnce(new Error("hide failed"));
    const { unmount } = render(<Changelog />);
    await waitFor(() => expect(mocks.logger).toHaveBeenCalledWith(expect.stringContaining("hide failed")));
    unmount();
    mocks.queued = { version: "4", body: "Broken" };
    mocks.show.mockRejectedValueOnce(new Error("show failed"));
    render(<Changelog />);
    await waitFor(() => expect(mocks.logger).toHaveBeenCalledWith(expect.stringContaining("show failed")));
  });
});
