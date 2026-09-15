import { describe, expect, it } from "vitest";
import { issueTimeSyncTarget } from "./issueTimeSyncTarget";
import type { IssueIntegrationSettings } from "./types";
const gitlab = { provider: "gitlab", baseUrl: "https://git.test/subpath" } as IssueIntegrationSettings;
describe("spent-time destination", () => {
  it("uses the issue's own nested repository and supports base paths and Gitea", () => {
    expect(issueTimeSyncTarget(gitlab, "https://git.test/subpath/group/nested/project/-/issues/8", 8)).toBe("group/nested/project");
    expect(issueTimeSyncTarget({ ...gitlab, provider: "gitea" }, "https://git.test/subpath/owner/repo/issues/8/", 8)).toBe("owner/repo");
  });
  it.each([
    "https://other.test/subpath/group/project/-/issues/8",
    "https://user:secret@git.test/subpath/group/project/-/issues/8",
    "https://git.test/other/group/project/-/issues/8",
    "https://git.test/subpath/group/project/-/issues/9",
    "https://git.test/subpath/group/project/-/issues/8x",
    "https://git.test/subpath/group/%2Fproject/-/issues/8",
    "https://git.test/subpath/group/%zz/-/issues/8",
    "invalid",
  ])("rejects a mismatched or invalid destination before a write", (url) => {
    expect(() => issueTimeSyncTarget(gitlab, url, 8)).toThrow("Failed to log time: 422");
  });
});
