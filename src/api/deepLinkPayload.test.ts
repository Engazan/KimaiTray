import { describe, expect, it } from "vitest";
import {
  parseKimaiTrayDeepLink,
  parseStartTimerDeepLink,
  resolveDeepLinkConnectionId,
} from "./deepLinkPayload";

describe("KimaiTray start-timer deep links", () => {
  it("parses timer, issue, tags and custom plugin fields", () => {
    const parsed = parseStartTimerDeepLink(
      "kimaitray://start?connection=work&project=12&activity=34" +
        "&description=Review%20PR&tag=review&tags=git%2Curgent" +
        "&issue=https%3A%2F%2Fgit.example.test%2Fteam%2Frepo%2F-%2Fissues%2F7" +
        "&custom.issue_link=https%3A%2F%2Ftickets.example.test%2F7",
    );

    expect(parsed).toEqual({
      action: "start",
      connectionId: "work",
      projectId: 12,
      activityId: 34,
      begin: undefined,
      description: "Review PR",
      tags: ["review", "git", "urgent"],
      label: undefined,
      issueUrl: "https://git.example.test/team/repo/-/issues/7",
      customFields: {
        issue_link: "https://tickets.example.test/7",
      },
    });
  });

  it("parses an open-only new-timer link without project and activity", () => {
    expect(
      parseKimaiTrayDeepLink(
        "kimaitray://new?connection=work" +
          "&issue=https%3A%2F%2Fgit.example.test%2Fteam%2Frepo%2F-%2Fissues%2F7" +
          "&custom.issue_link=https%3A%2F%2Fgit.example.test%2Fteam%2Frepo%2F-%2Fissues%2F7",
      ),
    ).toEqual({
      action: "new",
      connectionId: "work",
      description: undefined,
      tags: undefined,
      issueUrl: "https://git.example.test/team/repo/-/issues/7",
      customFields: {
        issue_link: "https://git.example.test/team/repo/-/issues/7",
      },
    });
  });

  it("uses the active connection when the connection parameter is omitted", () => {
    const parsed = parseStartTimerDeepLink(
      "kimaitray://start?project=12&activity=34",
    );

    expect(resolveDeepLinkConnectionId(parsed, "active-connection")).toBe(
      "active-connection",
    );
  });

  it("prefers an explicitly requested connection over the active one", () => {
    const parsed = parseStartTimerDeepLink(
      "kimaitray://start?connection=work&project=12&activity=34",
    );

    expect(resolveDeepLinkConnectionId(parsed, "active-connection")).toBe("work");
  });

  it("does not treat an open-only link as an immediate start", () => {
    expect(() => parseStartTimerDeepLink("kimaitray://new")).toThrow(
      "does not start a timer",
    );
  });

  it.each([
    "https://example.test/start?project=1&activity=2",
    "kimaitray://settings?project=1&activity=2",
    "kimaitray://start?project=x&activity=2",
    "kimaitray://start?project=1",
    "kimaitray://start?project=1&activity=2&issue=file%3A%2F%2Fsecret",
  ])("rejects unsupported or unsafe input: %s", (url) => {
    expect(() => parseStartTimerDeepLink(url)).toThrow();
  });
});
