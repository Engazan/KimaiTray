import { beforeEach, describe, expect, it, vi } from "vitest";
import { createGiteaProvider } from "./giteaIssueProvider";
import { createGitHubProvider } from "./githubIssueProvider";
import { createGitLabProvider } from "./gitlabIssueProvider";
import { parseIssueNumberQuery, prependExactIssue } from "./issueNumberQuery";
import type { IssueIntegrationSettings, IssueProviderType } from "./types";

const http = vi.hoisted(() => ({ safeHttpFetch: vi.fn() }));

vi.mock("../../api/safeHttp", () => http);

function config(provider: IssueProviderType): IssueIntegrationSettings {
  return {
    enabled: true,
    provider,
    baseUrl: "https://git.example.test",
    apiBaseUrl: "https://api.github.test",
    projectPathOrRepo: "group/project",
    defaultState: "opened",
    assigneeOnly: false,
    syncTime: false,
    autoInsertUrl: false,
    showTimeEstimate: false,
    filterLabels: [],
    filterLabelsMode: "include",
  };
}

const response = (body: unknown, ok = true, status = 200) => ({
  ok,
  status,
  statusText: ok ? "OK" : "Not Found",
  json: async () => body,
});

const githubIssue = (number: number, patch: Record<string, unknown> = {}) => ({
  number,
  title: `GitHub ${number}`,
  state: "open",
  html_url: `https://git.example.test/group/project/issues/${number}`,
  labels: [],
  user: { login: "alice" },
  ...patch,
});

const giteaIssue = (number: number, patch: Record<string, unknown> = {}) => ({
  ...githubIssue(number),
  title: `Gitea ${number}`,
  pull_request: null,
  ...patch,
});

const gitlabIssue = (iid: number, title = `GitLab ${iid}`) => ({
  iid,
  title,
  state: "opened",
  web_url: `https://git.example.test/group/project/-/issues/${iid}`,
  labels: [],
  author: { username: "bob" },
});

/** Route mocked requests by URL path (a GitLab server search adds a
 *  "?search" suffix to the key); unmatched paths return 404. */
function route(handlers: Record<string, unknown>) {
  http.safeHttpFetch.mockImplementation(async (url: string) => {
    const parsed = new URL(url);
    const key = parsed.searchParams.has("search") ? `${parsed.pathname}?search` : parsed.pathname;
    return key in handlers ? response(handlers[key]) : response({}, false, 404);
  });
}

describe("parseIssueNumberQuery", () => {
  it.each([
    ["42", 42],
    ["#42", 42],
    ["  # 7 ", 7],
    ["1", 1],
  ])("parses %j", (query, expected) => {
    expect(parseIssueNumberQuery(query)).toBe(expected);
  });

  it.each(["", "#", "0", "#0", "12a", "fix 12", "-3", "1.5", "1234567890"])(
    "ignores %j",
    (query) => {
      expect(parseIssueNumberQuery(query)).toBeNull();
    },
  );
});

describe("prependExactIssue", () => {
  const id = (n: number) => n;

  it("moves the exact match to the front without duplicates and applies the limit", () => {
    expect(prependExactIssue(3, [1, 2, 3, 4], id, 3)).toEqual([3, 1, 2]);
  });

  it("only limits the list when there is no exact match", () => {
    expect(prependExactIssue(null, [1, 2, 3], id, 2)).toEqual([1, 2]);
  });
});

describe("issue number search", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("GitLab loads the exact issue first and matches recent issues by number prefix", async () => {
    route({
      "/api/v4/projects/group%2Fproject/issues/12": gitlabIssue(12, "Exact"),
      "/api/v4/projects/group%2Fproject/issues?search": [],
      "/api/v4/projects/group%2Fproject/issues": [gitlabIssue(120), gitlabIssue(5), gitlabIssue(12, "Exact")],
    });

    const result = await createGitLabProvider(config("gitlab"), "secret", "conn").searchIssues("#12");

    expect(result.map((i) => i.id)).toEqual([12, 120]);
    expect(result[0].title).toBe("Exact");
    const searchUrls = http.safeHttpFetch.mock.calls
      .map(([url]) => new URL(url as string))
      .filter((url) => url.searchParams.has("search"));
    expect(searchUrls[0].searchParams.get("search")).toBe("12");
  });

  it("GitLab searches a single-digit number and tolerates a missing issue", async () => {
    route({
      "/api/v4/projects/group%2Fproject/issues?search": [],
      "/api/v4/projects/group%2Fproject/issues": [gitlabIssue(7)],
    });

    const result = await createGitLabProvider(config("gitlab"), "secret", "conn").searchIssues("3");

    expect(result).toEqual([]);
  });

  it("GitHub prepends the exact issue to text search results", async () => {
    route({
      "/repos/group/project/issues/42": githubIssue(42),
      "/search/issues": { items: [githubIssue(9), githubIssue(42)] },
    });

    const result = await createGitHubProvider(config("github"), "secret", "conn").searchIssues("#42");

    expect(result.map((i) => i.id)).toEqual([42, 9]);
    const searchCall = http.safeHttpFetch.mock.calls
      .map(([url]) => new URL(url as string))
      .find((url) => url.pathname === "/search/issues");
    expect(searchCall?.searchParams.get("q")).toMatch(/^42\+repo:/);
  });

  it("GitHub ignores a pull request with the requested number", async () => {
    route({
      "/repos/group/project/issues/4": githubIssue(4, { pull_request: {} }),
      "/repos/group/project/issues": [githubIssue(1)],
    });

    const result = await createGitHubProvider(config("github"), "secret", "conn").searchIssues("4");

    expect(result.map((i) => i.id)).toEqual([1]);
  });

  it("GitHub prepends a single-digit exact issue to the recent list", async () => {
    route({
      "/repos/group/project/issues/3": githubIssue(3),
      "/repos/group/project/issues": [githubIssue(1), githubIssue(3)],
    });

    const result = await createGitHubProvider(config("github"), "secret", "conn").searchIssues("3");

    expect(result.map((i) => i.id)).toEqual([3, 1]);
  });

  it("GitHub keeps search results when the requested number does not exist", async () => {
    route({ "/search/issues": { items: [githubIssue(9)] } });

    const result = await createGitHubProvider(config("github"), "secret", "conn").searchIssues("99");

    expect(result.map((i) => i.id)).toEqual([9]);
  });

  it("Gitea prepends the exact issue and keeps results when it is missing", async () => {
    route({
      "/api/v1/repos/group/project/issues/5": giteaIssue(5),
      "/api/v1/repos/group/project/issues": [giteaIssue(1), giteaIssue(5)],
    });
    const provider = createGiteaProvider(config("gitea"), "secret", "conn");

    await expect(provider.searchIssues("#5")).resolves.toEqual([
      expect.objectContaining({ id: 5 }),
      expect.objectContaining({ id: 1 }),
    ]);
    await expect(provider.searchIssues("77")).resolves.toEqual([
      expect.objectContaining({ id: 1 }),
      expect.objectContaining({ id: 5 }),
    ]);
  });

  it("Gitea ignores a pull request with the requested number", async () => {
    route({
      "/api/v1/repos/group/project/issues/6": giteaIssue(6, { pull_request: { merged: false } }),
      "/api/v1/repos/group/project/issues": [],
    });

    await expect(createGiteaProvider(config("gitea"), "secret", "conn").searchIssues("6")).resolves.toEqual([]);
  });
});
