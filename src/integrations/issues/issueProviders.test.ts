import { beforeEach, describe, expect, it, vi } from "vitest";
import { createGiteaProvider } from "./giteaIssueProvider";
import { createGitHubProvider } from "./githubIssueProvider";
import { createGitLabProvider } from "./gitlabIssueProvider";
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
    showTimeEstimate: true,
    filterLabels: [],
    filterLabelsMode: "include",
  };
}

const githubIssue = (patch: Record<string, unknown> = {}) => ({
  number: 7,
  title: "GitHub issue",
  state: "open",
  html_url: "https://git.example.test/group/project/issues/7",
  labels: [{ name: "bug" }],
  user: { login: "alice" },
  ...patch,
});

const gitlabIssue = (patch: Record<string, unknown> = {}) => ({
  iid: 8,
  title: "Žltá feature",
  state: "opened",
  web_url: "https://git.example.test/group/project/-/issues/8",
  labels: ["feature"],
  author: { username: "bob" },
  time_stats: { time_estimate: 3600, total_time_spent: 120 },
  ...patch,
});

const giteaIssue = (patch: Record<string, unknown> = {}) => ({
  number: 9,
  title: "Gitea issue",
  state: "open",
  html_url: "https://git.example.test/group/project/issues/9",
  labels: [{ name: "help", color: "00ff00" }],
  user: { login: "carol" },
  ...patch,
});

const response = (body: unknown, ok = true, status = 200, statusText = "OK") => ({
  ok,
  status,
  statusText,
  json: async () => body,
});

describe("issue provider API boundaries", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    http.safeHttpFetch.mockResolvedValue({
      ok: true,
      json: async () => [{ id: "unexpected-shape" }],
    });
  });

  it.each([
    ["GitLab", () => createGitLabProvider(config("gitlab"), "secret", "connection-a")],
    ["GitHub", () => createGitHubProvider(config("github"), "secret", "connection-a")],
    ["Gitea", () => createGiteaProvider(config("gitea"), "secret", "connection-a")],
  ])("rejects malformed %s issue lists", async (_name, createProvider) => {
    await expect(createProvider().searchIssues("")).rejects.toThrow(
      "returned an invalid response",
    );
    expect(http.safeHttpFetch).toHaveBeenLastCalledWith(
      expect.any(String),
      expect.objectContaining({
        authorization: { type: "issue", connectionId: "connection-a" },
      }),
    );
  });

  it.each(["issues", "work_items"])(
    "refreshes GitLab time stats when restoring a GitLab %s URL",
    async (route) => {
      http.safeHttpFetch
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            iid: 42,
            title: "Keep the previous time",
            state: "opened",
            web_url: "https://git.example.test/group/project/-/issues/42",
            labels: [],
            author: { username: "developer" },
            time_stats: {
              time_estimate: 7_200,
              total_time_spent: 0,
            },
          }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            time_estimate: 7_200,
            total_time_spent: 3_600,
          }),
        });
      const provider = createGitLabProvider(
        config("gitlab"),
        "secret",
        "connection-a",
      );

      const restored = await provider.fetchIssueByUrl?.(
        `https://git.example.test/group/project/-/${route}/42`,
      );

      expect(restored).toMatchObject({
        id: 42,
        timeEstimate: 7_200,
        timeSpent: 3_600,
      });
      expect(http.safeHttpFetch).toHaveBeenNthCalledWith(
        2,
        "https://git.example.test/api/v4/projects/group%2Fproject/issues/42/time_stats",
        expect.objectContaining({
          authorization: { type: "issue", connectionId: "connection-a" },
        }),
      );
    },
  );

  it("loads a GitHub issue from an allowed web URL", async () => {
    http.safeHttpFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        number: 42,
        title: "Deep-linked GitHub issue",
        state: "open",
        html_url: "https://git.example.test/group/project/issues/42",
        labels: [{ name: "automation" }],
        user: { login: "developer" },
      }),
    });
    const provider = createGitHubProvider(
      config("github"),
      "secret",
      "connection-a",
    );

    await expect(
      provider.fetchIssueByUrl?.(
        "https://git.example.test/group/project/issues/42",
      ),
    ).resolves.toMatchObject({ id: 42, title: "Deep-linked GitHub issue" });
    expect(http.safeHttpFetch).toHaveBeenCalledWith(
      "https://api.github.test/repos/group/project/issues/42",
      expect.objectContaining({
        authorization: { type: "issue", connectionId: "connection-a" },
      }),
    );
  });

  it("loads a Gitea issue from an allowed web URL", async () => {
    http.safeHttpFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        number: 42,
        title: "Deep-linked Gitea issue",
        state: "open",
        html_url: "https://git.example.test/group/project/issues/42",
        labels: [{ name: "automation", color: "00ff00" }],
        user: { login: "developer" },
      }),
    });
    const provider = createGiteaProvider(
      config("gitea"),
      "secret",
      "connection-a",
    );

    await expect(
      provider.fetchIssueByUrl?.(
        "https://git.example.test/group/project/issues/42",
      ),
    ).resolves.toMatchObject({ id: 42, title: "Deep-linked Gitea issue" });
    expect(http.safeHttpFetch).toHaveBeenCalledWith(
      "https://git.example.test/api/v1/repos/group/project/issues/42",
      expect.objectContaining({
        authorization: { type: "issue", connectionId: "connection-a" },
      }),
    );
  });

  it.each([
    ["GitLab", () => createGitLabProvider(config("gitlab"), "secret", "connection-a")],
    ["GitHub", () => createGitHubProvider(config("github"), "secret", "connection-a")],
    ["Gitea", () => createGiteaProvider(config("gitea"), "secret", "connection-a")],
  ])("rejects a deep-linked %s issue from another origin", async (_name, createProvider) => {
    const provider = createProvider();

    await expect(
      provider.fetchIssueByUrl?.("https://attacker.example/issues/42"),
    ).resolves.toBeNull();
    expect(http.safeHttpFetch).not.toHaveBeenCalled();
  });

  describe("GitHub provider behavior", () => {
    it("tests the connection, filters pull requests and exposes canonical URLs", async () => {
      http.safeHttpFetch.mockResolvedValueOnce(response([
        githubIssue(),
        githubIssue({ number: 8, pull_request: {} }),
      ]));
      const provider = createGitHubProvider(config("github"), "secret");

      await expect(provider.testConnection()).resolves.toEqual({ success: true, count: 1 });
      expect(provider.getIssueUrl({ webUrl: "https://git.example.test/group/project/issues/7" } as never)).toBe(
        "https://git.example.test/group/project/issues/7",
      );
      expect(http.safeHttpFetch).toHaveBeenCalledWith(
        expect.stringContaining("state=open"),
        expect.objectContaining({ authorization: { type: "test", origin: "https://api.github.test" } }),
      );
    });

    it("returns API failures from connection tests", async () => {
      http.safeHttpFetch.mockResolvedValueOnce(response({}, false, 401, "Unauthorized"));
      await expect(createGitHubProvider(config("github"), "secret").testConnection()).resolves.toEqual({
        success: false,
        error: "GitHub API error: 401 Unauthorized",
      });
    });

    it("searches with assignee and exclusion filters, caching the username", async () => {
      const settings = { ...config("github"), assigneeOnly: true, filterLabels: ["wontfix"], filterLabelsMode: "exclude" as const };
      http.safeHttpFetch
        .mockResolvedValueOnce(response({ login: "me" }))
        .mockResolvedValueOnce(response({ items: [githubIssue(), githubIssue({ number: 10, pull_request: {} })] }))
        .mockResolvedValueOnce(response([githubIssue(), githubIssue({ number: 11, labels: [{ name: "wontfix" }] })]));
      const provider = createGitHubProvider(settings, "secret", "conn");

      await expect(provider.searchIssues("fix")).resolves.toEqual([
        expect.objectContaining({ id: 7, labels: ["bug"], author: "alice" }),
      ]);
      await expect(provider.searchIssues("")).resolves.toHaveLength(1);
      expect(http.safeHttpFetch).toHaveBeenCalledTimes(3);
      expect(http.safeHttpFetch.mock.calls[1][0]).toContain("assignee%3Ame");
      expect(http.safeHttpFetch.mock.calls[1][0]).toContain("-label%3A%22wontfix%22");
    });

    it("loads included labels, repositories, and list filters", async () => {
      const settings = { ...config("github"), defaultState: "all" as const, filterLabels: ["bug"], filterLabelsMode: "include" as const };
      http.safeHttpFetch
        .mockResolvedValueOnce(response([githubIssue({ user: null })]))
        .mockResolvedValueOnce(response([{ name: "bug", color: "ff0000" }]))
        .mockResolvedValueOnce(response([{ full_name: "group/project" }]));
      const provider = createGitHubProvider(settings, "secret", "conn");
      await expect(provider.searchIssues("x")).resolves.toEqual([expect.objectContaining({ author: "" })]);
      expect(http.safeHttpFetch.mock.calls[0][0]).toContain("labels=bug");
      await expect(provider.fetchLabels?.()).resolves.toEqual([{ name: "bug", color: "#ff0000" }]);
      await expect(provider.fetchRepos?.()).resolves.toEqual([{ id: "group/project", label: "group/project" }]);
    });

    it.each([
      "https://user:pass@git.example.test/group/project/issues/7",
      "https://git.example.test/not-an-issue",
    ])("rejects malformed or credentialed GitHub URLs: %s", async (url) => {
      await expect(createGitHubProvider(config("github"), "secret").fetchIssueByUrl?.(url)).resolves.toBeNull();
      expect(http.safeHttpFetch).not.toHaveBeenCalled();
    });

    it("rejects pull requests and logs malformed API responses", async () => {
      http.safeHttpFetch.mockResolvedValueOnce(response(githubIssue({ pull_request: {} })));
      await expect(createGitHubProvider(config("github"), "secret").fetchIssueByUrl?.(
        "https://git.example.test/group/project/issues/7",
      )).resolves.toBeNull();
    });

    it("rejects URLs outside a configured base path and catches invalid issue payloads", async () => {
      const nested = { ...config("github"), baseUrl: "https://git.example.test/git" };
      await expect(createGitHubProvider(nested, "secret").fetchIssueByUrl?.(
        "https://git.example.test/group/project/issues/7",
      )).resolves.toBeNull();
      http.safeHttpFetch.mockResolvedValueOnce(response({ invalid: true }));
      await expect(createGitHubProvider(config("github"), "secret").fetchIssueByUrl?.(
        "https://git.example.test/group/project/issues/7",
      )).resolves.toBeNull();
    });
  });

  describe("GitLab provider behavior", () => {
    it("rejects a non-object issue in a list", async () => {
      http.safeHttpFetch.mockResolvedValueOnce(response([null]));
      await expect(
        createGitLabProvider(config("gitlab"), "secret").searchIssues(""),
      ).rejects.toThrow("returned an invalid response");
    });

    it("tests connections and builds issue URLs", async () => {
      http.safeHttpFetch.mockResolvedValueOnce(response([gitlabIssue()]));
      const provider = createGitLabProvider(config("gitlab"), "secret");
      await expect(provider.testConnection()).resolves.toEqual({ success: true, count: 1 });
      expect(provider.getIssueUrl({ id: 8 } as never)).toBe(
        "https://git.example.test/group/project/-/issues/8",
      );
    });

    it("applies state, assignee and label filters to recent issues", async () => {
      const settings = { ...config("gitlab"), assigneeOnly: true, filterLabels: ["spam"], filterLabelsMode: "exclude" as const };
      http.safeHttpFetch.mockResolvedValueOnce(response([gitlabIssue({ author: null, time_stats: { time_estimate: 0, total_time_spent: 0 } })]));
      const result = await createGitLabProvider(settings, "secret", "conn").searchIssues(" ");
      expect(result).toEqual([expect.objectContaining({ author: "", timeEstimate: undefined, timeSpent: undefined })]);
      expect(http.safeHttpFetch.mock.calls[0][0]).toContain("scope=assigned_to_me");
      expect(http.safeHttpFetch.mock.calls[0][0]).toContain("not%5Blabels%5D=spam");
    });

    it("merges, deduplicates, normalizes and limits long searches", async () => {
      const server = Array.from({ length: 15 }, (_, index) => gitlabIssue({ iid: index + 1, title: `Server ${index}` }));
      const recent = [gitlabIssue({ iid: 1, title: "Žltá duplicate" }), ...Array.from({ length: 12 }, (_, index) => gitlabIssue({ iid: index + 20, title: `žltá local ${index}` }))];
      http.safeHttpFetch.mockResolvedValueOnce(response(server)).mockResolvedValueOnce(response(recent));
      const result = await createGitLabProvider(config("gitlab"), "secret", "conn").searchIssues("zlta");
      expect(result).toHaveLength(20);
      expect(new Set(result.map((issue) => issue.id)).size).toBe(20);
    });

    it("falls back to embedded time stats when the dedicated endpoint fails", async () => {
      http.safeHttpFetch
        .mockResolvedValueOnce(response(gitlabIssue()))
        .mockResolvedValueOnce(response({}, false, 404, "Missing"));
      await expect(createGitLabProvider(config("gitlab"), "secret", "conn").fetchIssueByUrl?.(
        "https://git.example.test/group/project/-/issues/8",
      )).resolves.toEqual(expect.objectContaining({ timeEstimate: 3600, timeSpent: 120 }));
    });

    it.each([
      "https://user:pass@git.example.test/group/project/-/issues/8",
      "https://git.example.test/group/project/nope/8",
    ])("rejects invalid GitLab URLs: %s", async (url) => {
      await expect(createGitLabProvider(config("gitlab"), "secret").fetchIssueByUrl?.(url)).resolves.toBeNull();
    });

    it("logs spent time in minute and hour formats and ignores sub-minute durations", async () => {
      http.safeHttpFetch.mockResolvedValue(response({}));
      const provider = createGitLabProvider(config("gitlab"), "secret", "conn");
      await provider.addSpentTime?.(8, 59);
      expect(http.safeHttpFetch).not.toHaveBeenCalled();
      await provider.addSpentTime?.(8, 300);
      await provider.addSpentTime?.(8, 3900);
      expect(JSON.parse(http.safeHttpFetch.mock.calls[0][1].body)).toEqual({ duration: "5m" });
      expect(JSON.parse(http.safeHttpFetch.mock.calls[1][1].body)).toEqual({ duration: "1h5m" });
    });

    it("throws when GitLab rejects spent time", async () => {
      http.safeHttpFetch.mockResolvedValueOnce(response({}, false, 500, "Error"));
      await expect(createGitLabProvider(config("gitlab"), "secret").addSpentTime?.(8, 60)).rejects.toThrow("Failed to log time: 500");
    });

    it("loads labels and repositories", async () => {
      http.safeHttpFetch
        .mockResolvedValueOnce(response([{ name: "bug", color: "#f00" }]))
        .mockResolvedValueOnce(response([{ path_with_namespace: "group/project" }]));
      const provider = createGitLabProvider(config("gitlab"), "secret");
      await expect(provider.fetchLabels?.()).resolves.toEqual([{ name: "bug", color: "#f00" }]);
      await expect(provider.fetchRepos?.()).resolves.toEqual([{ id: "group/project", label: "group/project" }]);
    });

    it("reports malformed connection data, includes labels and catches invalid restored issues", async () => {
      http.safeHttpFetch.mockResolvedValueOnce(response({ invalid: true }));
      await expect(createGitLabProvider(config("gitlab"), "secret").testConnection()).resolves.toMatchObject({ success: false });

      const included = { ...config("gitlab"), filterLabels: ["bug"], filterLabelsMode: "include" as const };
      http.safeHttpFetch.mockResolvedValueOnce(response([gitlabIssue()]));
      await createGitLabProvider(included, "secret").searchIssues("");
      expect(http.safeHttpFetch.mock.calls.slice(-1)[0]?.[0]).toContain("labels=bug");

      http.safeHttpFetch.mockResolvedValueOnce(response({ invalid: true }));
      await expect(createGitLabProvider(config("gitlab"), "secret").fetchIssueByUrl?.(
        "https://git.example.test/group/project/-/issues/8",
      )).resolves.toBeNull();
      const nested = { ...config("gitlab"), baseUrl: "https://git.example.test/git" };
      await expect(createGitLabProvider(nested, "secret").fetchIssueByUrl?.(
        "https://git.example.test/group/project/-/issues/8",
      )).resolves.toBeNull();
    });
  });

  describe("Gitea provider behavior", () => {
    it("tests, searches, caches assignee identity and excludes labels", async () => {
      const settings = { ...config("gitea"), assigneeOnly: true, filterLabels: ["skip"], filterLabelsMode: "exclude" as const };
      http.safeHttpFetch
        .mockResolvedValueOnce(response([giteaIssue()]))
        .mockResolvedValueOnce(response({ login: "me" }))
        .mockResolvedValueOnce(response([giteaIssue({ user: null }), giteaIssue({ number: 10, labels: [{ name: "skip", color: "fff" }] })]))
        .mockResolvedValueOnce(response([giteaIssue()]));
      const provider = createGiteaProvider(settings, "secret", "conn");
      await expect(provider.testConnection()).resolves.toEqual({ success: true, count: 1 });
      await expect(provider.searchIssues("find")).resolves.toEqual([expect.objectContaining({ id: 9, author: "" })]);
      await provider.searchIssues("");
      expect(http.safeHttpFetch.mock.calls.filter(([url]) => String(url).endsWith("/user")).length).toBe(1);
    });

    it("applies included labels and normalizes label colors and repos", async () => {
      const settings = { ...config("gitea"), defaultState: "all" as const, filterLabels: ["bug"] };
      http.safeHttpFetch
        .mockResolvedValueOnce(response([giteaIssue()]))
        .mockResolvedValueOnce(response([{ name: "one", color: "#123456" }, { name: "two", color: "abcdef" }]))
        .mockResolvedValueOnce(response([{ full_name: "group/project" }]));
      const provider = createGiteaProvider(settings, "secret");
      await provider.searchIssues("x");
      expect(http.safeHttpFetch.mock.calls[0][0]).toContain("labels=bug");
      await expect(provider.fetchLabels?.()).resolves.toEqual([
        { name: "one", color: "#123456" }, { name: "two", color: "#abcdef" },
      ]);
      await expect(provider.fetchRepos?.()).resolves.toEqual([{ id: "group/project", label: "group/project" }]);
    });

    it("logs time, ignores short durations and reports server failures", async () => {
      const provider = createGiteaProvider(config("gitea"), "secret", "conn");
      await provider.addSpentTime?.(9, 30);
      expect(http.safeHttpFetch).not.toHaveBeenCalled();
      http.safeHttpFetch.mockResolvedValueOnce(response({}));
      await provider.addSpentTime?.(9, 90);
      expect(JSON.parse(http.safeHttpFetch.mock.calls[0][1].body)).toEqual({ time: 90 });
      http.safeHttpFetch.mockResolvedValueOnce(response({}, false, 500, "Error"));
      await expect(provider.addSpentTime?.(9, 90)).rejects.toThrow("Failed to log time: 500");
    });

    it.each([
      "https://user:pass@git.example.test/group/project/issues/9",
      "https://git.example.test/not-an-issue",
    ])("rejects invalid Gitea URLs: %s", async (url) => {
      await expect(createGiteaProvider(config("gitea"), "secret").fetchIssueByUrl?.(url)).resolves.toBeNull();
    });

    it("returns canonical URLs and handles API and restored-payload failures", async () => {
      const provider = createGiteaProvider(config("gitea"), "secret");
      expect(provider.getIssueUrl({ webUrl: "https://git.example.test/9" } as never)).toBe("https://git.example.test/9");
      http.safeHttpFetch.mockResolvedValueOnce(response({}, false, 503, "Unavailable"));
      await expect(provider.testConnection()).resolves.toMatchObject({ success: false, error: expect.stringContaining("503") });

      http.safeHttpFetch.mockResolvedValueOnce(response({ invalid: true }));
      await expect(provider.fetchIssueByUrl?.("https://git.example.test/group/project/issues/9")).resolves.toBeNull();
      const nested = { ...config("gitea"), baseUrl: "https://git.example.test/git" };
      await expect(createGiteaProvider(nested, "secret").fetchIssueByUrl?.(
        "https://git.example.test/group/project/issues/9",
      )).resolves.toBeNull();
    });
  });
});
