import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  emitTo: vi.fn(),
  getByLabel: vi.fn(),
  show: vi.fn(),
  setFocus: vi.fn(),
}));

vi.mock("@tauri-apps/api/event", () => ({ emitTo: mocks.emitTo }));
vi.mock("@tauri-apps/api/window", () => ({
  Window: { getByLabel: mocks.getByLabel },
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
    mocks.getByLabel.mockResolvedValue({
      show: mocks.show,
      setFocus: mocks.setFocus,
    });
  });

  it("sends content before opening and focusing the dedicated window", async () => {
    const changelog = { version: "2.1.0", body: "### New Features" };

    await expect(showChangelogWindow(changelog)).resolves.toBe(true);

    expect(mocks.emitTo).toHaveBeenCalledWith(
      CHANGELOG_WINDOW_LABEL,
      CHANGELOG_SHOW_EVENT,
      changelog,
    );
    expect(mocks.show).toHaveBeenCalledOnce();
    expect(mocks.setFocus).toHaveBeenCalledOnce();
    expect(mocks.emitTo.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.show.mock.invocationCallOrder[0],
    );
  });

  it("does nothing when the changelog window is unavailable", async () => {
    mocks.getByLabel.mockResolvedValue(null);
    await expect(
      showChangelogWindow({ version: "2.1.0", body: "Notes" }),
    ).resolves.toBe(false);
    expect(mocks.emitTo).not.toHaveBeenCalled();
  });
});
