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

  it("trims optional values, deduplicates tags and ignores empty custom values", () => {
    expect(parseStartTimerDeepLink(
      "kimaitray://start?project=1&activity=2&connection=%20work%20&begin=%20now%20&label=%20Label%20&tag=a&tag=%20a%20&tags=%2Cb%2C&custom.empty=%20%20",
    )).toMatchObject({ connectionId: "work", begin: "now", label: "Label", tags: ["a", "b"], customFields: {} });
  });

  it.each([
    ["invalid URL", "not a url"],
    ["oversized link", `kimaitray://new?description=${"x".repeat(16_400)}`],
    ["path", "kimaitray://new/nested"],
    ["description", `kimaitray://new?description=${"x".repeat(4_001)}`],
    ["zero id", "kimaitray://start?project=0&activity=2"],
    ["unsafe id", "kimaitray://start?project=999999999999999999999&activity=2"],
    ["invalid issue", "kimaitray://new?issue=invalid"],
    ["credential issue", "kimaitray://new?issue=https%3A%2F%2Fu%3Ap%40example.test"],
    ["long issue", `kimaitray://new?issue=https%3A%2F%2Fexample.test%2F${"x".repeat(2_050)}`],
    ["long tag", `kimaitray://new?tag=${"x".repeat(257)}`],
    ["many tags", `kimaitray://new?${Array.from({ length: 51 }, (_, i) => `tag=${i}`).join("&")}`],
    ["empty custom name", "kimaitray://new?custom.%20=x"],
    ["long custom name", `kimaitray://new?custom.${"x".repeat(257)}=v`],
    ["long custom value", `kimaitray://new?custom.key=${"x".repeat(4_001)}`],
    ["many custom fields", `kimaitray://new?${Array.from({ length: 33 }, (_, i) => `custom.k${i}=v`).join("&")}`],
  ])("rejects %s", (_name, url) => {
    expect(() => parseKimaiTrayDeepLink(url)).toThrow();
  });
});
