import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  emitTo: vi.fn(),
  getByLabel: vi.fn(),
  queueChangelogWindow: vi.fn(),
  create: vi.fn(),
  once: vi.fn(),
}));

vi.mock("@tauri-apps/api/event", () => ({ emitTo: mocks.emitTo }));
vi.mock("@tauri-apps/api/webviewWindow", () => ({
  WebviewWindow: class {
    static getByLabel = mocks.getByLabel;

    constructor(label: string, options: unknown) {
      mocks.create(label, options);
    }

    once(event: string, handler: (event: { payload: unknown }) => void) {
      return mocks.once(event, handler);
    }
  },
}));
vi.mock("./changelog", () => ({
  queueChangelogWindow: mocks.queueChangelogWindow,
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
    mocks.queueChangelogWindow.mockReturnValue(true);
    mocks.getByLabel.mockResolvedValue({});
    mocks.once.mockImplementation(
      (event: string, handler: (event: { payload: unknown }) => void) => {
        if (event === "tauri://created") {
          queueMicrotask(() => handler({ payload: null }));
        }
        return Promise.resolve(() => {});
      },
    );
  });

  it("updates an existing changelog window without recreating it", async () => {
    const changelog = { version: "2.1.0", body: "### New Features" };

    await expect(showChangelogWindow(changelog)).resolves.toBe(true);

    expect(mocks.emitTo).toHaveBeenCalledWith(
      CHANGELOG_WINDOW_LABEL,
      CHANGELOG_SHOW_EVENT,
      changelog,
    );
    expect(mocks.create).not.toHaveBeenCalled();
    expect(mocks.queueChangelogWindow).toHaveBeenCalledWith(changelog);
  });

  it("creates a hidden changelog window only after staging content", async () => {
    const changelog = { version: "2.1.0", body: "Notes" };
    mocks.getByLabel.mockResolvedValue(null);

    await expect(showChangelogWindow(changelog)).resolves.toBe(true);

    expect(mocks.queueChangelogWindow).toHaveBeenCalledWith(changelog);
    expect(mocks.create).toHaveBeenCalledWith(
      CHANGELOG_WINDOW_LABEL,
      expect.objectContaining({
        url: "/",
        visible: false,
      }),
    );
    expect(mocks.queueChangelogWindow.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.create.mock.invocationCallOrder[0],
    );
    expect(mocks.emitTo).not.toHaveBeenCalled();
  });

  it("does not create a window when content cannot be staged", async () => {
    mocks.getByLabel.mockResolvedValue(null);
    mocks.queueChangelogWindow.mockReturnValue(false);

    await expect(
      showChangelogWindow({ version: "2.1.0", body: "Notes" }),
    ).resolves.toBe(false);

    expect(mocks.create).not.toHaveBeenCalled();
    expect(mocks.emitTo).not.toHaveBeenCalled();
  });

  it("serializes creation before a subsequent content update", async () => {
    mocks.getByLabel
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({});
    const first = { version: "2.1.0", body: "First" };
    const second = { version: "2.1.0", body: "Second" };

    await Promise.all([
      showChangelogWindow(first),
      showChangelogWindow(second),
    ]);

    expect(mocks.create).toHaveBeenCalledOnce();
    expect(mocks.queueChangelogWindow).toHaveBeenNthCalledWith(1, first);
    expect(mocks.queueChangelogWindow).toHaveBeenNthCalledWith(2, second);
    expect(mocks.emitTo).toHaveBeenCalledWith(
      CHANGELOG_WINDOW_LABEL,
      CHANGELOG_SHOW_EVENT,
      second,
    );
  });
});
