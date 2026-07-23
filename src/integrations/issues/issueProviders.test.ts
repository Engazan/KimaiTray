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

  it("refreshes GitLab time stats when restoring an issue by URL", async () => {
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
      "https://git.example.test/group/project/-/issues/42",
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
  });
});
