import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  emitTo: vi.fn(),
  getByLabel: vi.fn(),
  queueChangelogWindow: vi.fn(),
  show: vi.fn(),
  setFocus: vi.fn(),
}));

vi.mock("@tauri-apps/api/event", () => ({ emitTo: mocks.emitTo }));
vi.mock("@tauri-apps/api/webviewWindow", () => ({
  WebviewWindow: class {
    static getByLabel = mocks.getByLabel;
  },
}));
vi.mock("./changelog", () => ({
  queueChangelogWindow: mocks.queueChangelogWindow,
}));
vi.mock("../utils/logger", () => ({
  logger: { error: vi.fn(), info: vi.fn() },
}));

import {
  CHANGELOG_SHOW_EVENT,
  CHANGELOG_WINDOW_LABEL,
  showChangelogWindow,
} from "./changelogWindow";

describe("changelog window bridge", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.emitTo.mockResolvedValue(undefined);
    mocks.show.mockResolvedValue(undefined);
    mocks.setFocus.mockResolvedValue(undefined);
    mocks.queueChangelogWindow.mockReturnValue(true);
    mocks.getByLabel.mockResolvedValue({
      show: mocks.show,
      setFocus: mocks.setFocus,
    });
  });

  it("stages content and updates the configured changelog window", async () => {
    const changelog = { version: "2.1.0", body: "### New Features" };

    await expect(showChangelogWindow(changelog)).resolves.toBe(true);

    expect(mocks.emitTo).toHaveBeenCalledWith(
      CHANGELOG_WINDOW_LABEL,
      CHANGELOG_SHOW_EVENT,
      changelog,
    );
    expect(mocks.show).toHaveBeenCalledOnce();
    expect(mocks.setFocus).toHaveBeenCalledOnce();
    expect(mocks.setFocus.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.emitTo.mock.invocationCallOrder[0],
    );
    expect(mocks.queueChangelogWindow).toHaveBeenCalledWith(changelog);
  });

  it("returns false when the configured changelog window is unavailable", async () => {
    const changelog = { version: "2.1.0", body: "Notes" };
    mocks.getByLabel.mockResolvedValue(null);

    await expect(showChangelogWindow(changelog)).resolves.toBe(false);

    expect(mocks.queueChangelogWindow).toHaveBeenCalledWith(changelog);
    expect(mocks.emitTo).not.toHaveBeenCalled();
  });

  it("uses the event when staging is unavailable", async () => {
    mocks.queueChangelogWindow.mockReturnValue(false);

    await expect(
      showChangelogWindow({ version: "2.1.0", body: "Notes" }),
    ).resolves.toBe(true);

    expect(mocks.emitTo).toHaveBeenCalledWith(
      CHANGELOG_WINDOW_LABEL,
      CHANGELOG_SHOW_EVENT,
      { version: "2.1.0", body: "Notes" },
    );
  });

  it("serializes subsequent content updates", async () => {
    const first = { version: "2.1.0", body: "First" };
    const second = { version: "2.1.0", body: "Second" };

    await Promise.all([
      showChangelogWindow(first),
      showChangelogWindow(second),
    ]);

    expect(mocks.queueChangelogWindow).toHaveBeenNthCalledWith(1, first);
    expect(mocks.queueChangelogWindow).toHaveBeenNthCalledWith(2, second);
    expect(mocks.emitTo).toHaveBeenNthCalledWith(
      1,
      CHANGELOG_WINDOW_LABEL,
      CHANGELOG_SHOW_EVENT,
      first,
    );
    expect(mocks.emitTo).toHaveBeenNthCalledWith(
      2,
      CHANGELOG_WINDOW_LABEL,
      CHANGELOG_SHOW_EVENT,
      second,
    );
  });
});
