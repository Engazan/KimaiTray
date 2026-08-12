// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import DetachedTitleBar from "./DetachedTitleBar";

const mocks = vi.hoisted(() => ({
  platform: { os: "linux", supportsAlwaysOnTop: true },
  hide: vi.fn(), minimize: vi.fn(), maximize: vi.fn(),
}));
vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
vi.mock("../platform", () => ({ usePlatform: () => mocks.platform }));
vi.mock("@tauri-apps/api/window", () => ({ getCurrentWindow: () => ({ hide: mocks.hide, minimize: mocks.minimize, toggleMaximize: mocks.maximize }) }));

beforeEach(() => { vi.clearAllMocks(); Object.assign(mocks.platform, { os: "linux", supportsAlwaysOnTop: true }); });
afterEach(cleanup);

describe("DetachedTitleBar", () => {
  it("operates Linux window and pin controls", async () => {
    const user = userEvent.setup();
    const toggle = vi.fn();
    const { rerender } = render(<DetachedTitleBar pinned={false} onTogglePin={toggle} pinLabel="pin" />);
    await user.click(screen.getByRole("button", { name: "pin" }));
    await user.click(screen.getByRole("button", { name: "common.minimize" }));
    await user.click(screen.getByRole("button", { name: "common.maximize" }));
    await user.click(screen.getByRole("button", { name: "common.hide" }));
    expect(toggle).toHaveBeenCalled();
    expect(mocks.minimize).toHaveBeenCalled();
    expect(mocks.maximize).toHaveBeenCalled();
    expect(mocks.hide).toHaveBeenCalled();

    rerender(<DetachedTitleBar pinned transparent onTogglePin={toggle} pinLabel="unpin" />);
    expect(screen.getByRole("button", { name: "unpin" })).toBeTruthy();
  });

  it("renders macOS traffic lights, hover colors and optional pin", async () => {
    const user = userEvent.setup();
    mocks.platform.os = "macos";
    const toggle = vi.fn();
    const { rerender } = render(<DetachedTitleBar pinned onTogglePin={toggle} pinLabel="unpin" />);
    const hide = screen.getByRole("button", { name: "common.hide" });
    fireEvent.mouseEnter(hide);
    expect(hide.style.backgroundColor).toBe("rgb(255, 59, 48)");
    fireEvent.mouseLeave(hide);
    expect(hide.style.backgroundColor).toBe("rgb(255, 95, 87)");
    await user.click(hide);
    await user.click(screen.getByRole("button", { name: "common.minimize" }));
    await user.click(screen.getByRole("button", { name: "common.maximize" }));
    expect(mocks.hide).toHaveBeenCalled();

    mocks.platform.supportsAlwaysOnTop = false;
    rerender(<DetachedTitleBar pinned={false} onTogglePin={toggle} pinLabel="pin" />);
    expect(screen.queryByRole("button", { name: "pin" })).toBeNull();
  });
});
