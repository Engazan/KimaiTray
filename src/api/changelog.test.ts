// @vitest-environment jsdom

import { beforeEach, describe, expect, it } from "vitest";
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
});
