// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  claimInstalledChangelog,
  extractVersionChangelog,
  forgetQueuedChangelogWindow,
  forgetPendingChangelog,
  queueChangelogWindow,
  readQueuedChangelogWindow,
  rememberPendingChangelog,
} from "./changelog";

describe("update changelog", () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => vi.unstubAllGlobals());

  it("is claimed once only by the installed target version", () => {
    const entry = { version: "2.1.0", body: "### Improvements\n\n- Faster" };
    rememberPendingChangelog(entry);

    expect(claimInstalledChangelog("2.0.0")).toBeNull();
    expect(claimInstalledChangelog("2.1.0")).toEqual(entry);
    expect(claimInstalledChangelog("2.1.0")).toBeNull();
  });

  it("forgets notes when installation of their version fails", () => {
    rememberPendingChangelog({ version: "2.1.0", body: "Fixes" });
    forgetPendingChangelog("2.0.0");
    expect(claimInstalledChangelog("2.1.0")).not.toBeNull();

    rememberPendingChangelog({ version: "2.2.0", body: "More fixes" });
    forgetPendingChangelog("2.2.0");
    expect(claimInstalledChangelog("2.2.0")).toBeNull();
  });

  it("extracts only the requested release from CHANGELOG.md", () => {
    const changelog = `# Changelog

## [2.1.0] - 2026-07-17

### New Features

- Changelog dialog

## [2.0.0] - 2026-07-01

- Previous release
`;

    expect(extractVersionChangelog(changelog, "2.1.0")).toBe(
      "### New Features\n\n- Changelog dialog",
    );
    expect(extractVersionChangelog(changelog, "1.0.0")).toBeNull();
  });

  it("drops invalid persisted data", () => {
    localStorage.setItem("kimai:pendingChangelog", "not-json");
    expect(claimInstalledChangelog("2.1.0")).toBeNull();
    expect(localStorage).toHaveLength(0);
  });

  it("stages window content until that exact content is displayed", () => {
    const first = { version: "2.1.0", body: "First" };
    const second = { version: "2.1.0", body: "Second" };

    expect(queueChangelogWindow(first)).toBe(true);
    expect(readQueuedChangelogWindow()).toEqual(first);
    expect(readQueuedChangelogWindow()).toEqual(first);

    forgetQueuedChangelogWindow(second);
    expect(readQueuedChangelogWindow()).toEqual(first);

    forgetQueuedChangelogWindow(first);
    expect(readQueuedChangelogWindow()).toBeNull();
  });

  it.each([
    null,
    [],
    {},
    { version: "", body: "notes" },
    { version: "x".repeat(65), body: "notes" },
    { version: "1", body: 3 },
    { version: "1", body: "x".repeat(100_001) },
  ])("rejects invalid changelog entries %#", (entry) => {
    expect(queueChangelogWindow(entry as never)).toBe(false);
    rememberPendingChangelog(entry as never);
    expect(localStorage).toHaveLength(0);
  });

  it("handles unavailable and failing storage without throwing", () => {
    const original = localStorage;
    vi.stubGlobal("localStorage", undefined);
    expect(claimInstalledChangelog("1")).toBeNull();
    expect(queueChangelogWindow({ version: "1", body: "x" })).toBe(false);
    expect(readQueuedChangelogWindow()).toBeNull();
    rememberPendingChangelog({ version: "1", body: "x" });
    forgetPendingChangelog("1");

    const failing = {
      getItem: vi.fn(() => { throw new Error("read"); }),
      setItem: vi.fn(() => { throw new Error("write"); }),
      removeItem: vi.fn(() => { throw new Error("remove"); }),
    };
    vi.stubGlobal("localStorage", failing);
    expect(claimInstalledChangelog("1")).toBeNull();
    expect(queueChangelogWindow({ version: "1", body: "x" })).toBe(false);
    expect(readQueuedChangelogWindow()).toBeNull();
    rememberPendingChangelog({ version: "1", body: "x" });
    forgetPendingChangelog("1");
    forgetQueuedChangelogWindow({ version: "1", body: "x" });
    expect(failing.removeItem).toHaveBeenCalled();
    vi.stubGlobal("localStorage", original);
  });

  it("cleans invalid queued values and covers empty changelog boundaries", () => {
    localStorage.setItem("kimai:queuedChangelogWindow", JSON.stringify({ version: "", body: "x" }));
    expect(readQueuedChangelogWindow()).toBeNull();
    expect(localStorage).toHaveLength(0);
    expect(claimInstalledChangelog("")).toBeNull();
    expect(extractVersionChangelog("## [1.0.0]", "")).toBeNull();
    expect(extractVersionChangelog("## [1.0.0]", "1.0.0")).toBeNull();
    expect(extractVersionChangelog("## 1.0.0\nbody", "1.0.0")).toBe("body");
  });

  it("removes malformed pending notes when explicitly forgotten", () => {
    localStorage.setItem("kimai:pendingChangelog", "{");
    forgetPendingChangelog("1");
    expect(localStorage).toHaveLength(0);
  });

  it("handles empty and structurally invalid pending values", () => {
    forgetPendingChangelog("missing");
    localStorage.setItem("kimai:pendingChangelog", JSON.stringify({ version: "1" }));
    expect(claimInstalledChangelog("1")).toBeNull();
    expect(localStorage).toHaveLength(0);
  });
});
