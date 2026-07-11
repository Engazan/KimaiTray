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
    ["GitLab", () => createGitLabProvider(config("gitlab"), "secret")],
    ["GitHub", () => createGitHubProvider(config("github"), "secret")],
    ["Gitea", () => createGiteaProvider(config("gitea"), "secret")],
  ])("rejects malformed %s issue lists", async (_name, createProvider) => {
    await expect(createProvider().searchIssues("")).rejects.toThrow(
      "returned an invalid response",
    );
  });
});
