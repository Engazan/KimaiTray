import { beforeEach, describe, expect, it, vi } from "vitest";
import type { IssueIntegrationSettings } from "./types";

const factories = vi.hoisted(() => ({
  gitlab: vi.fn(),
  github: vi.fn(),
  gitea: vi.fn(),
}));

vi.mock("./gitlabIssueProvider", () => ({ createGitLabProvider: factories.gitlab }));
vi.mock("./githubIssueProvider", () => ({ createGitHubProvider: factories.github }));
vi.mock("./giteaIssueProvider", () => ({ createGiteaProvider: factories.gitea }));

import { createIssueProvider } from "./issueProvider";

function config(provider: IssueIntegrationSettings["provider"]): IssueIntegrationSettings {
  return {
    enabled: true,
    provider,
    baseUrl: "https://git.test",
    apiBaseUrl: "https://api.git.test",
    projectPathOrRepo: "group/repo",
    defaultState: "opened",
    assigneeOnly: false,
    syncTime: false,
    autoInsertUrl: false,
    showTimeEstimate: true,
    filterLabels: [],
    filterLabelsMode: "include",
  };
}

describe("issue provider selection", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    factories.gitlab.mockReturnValue({ kind: "gitlab" });
    factories.github.mockReturnValue({ kind: "github" });
    factories.gitea.mockReturnValue({ kind: "gitea" });
  });

  it.each([
    ["gitlab", factories.gitlab],
    ["github", factories.github],
    ["gitea", factories.gitea],
  ] as const)("creates the configured %s provider", (provider, factory) => {
    const settings = config(provider);

    const result = createIssueProvider(settings, "secret", "connection-a");

    expect(result).toEqual({ kind: provider });
    expect(factory).toHaveBeenCalledWith(settings, "secret", "connection-a");
  });

  it("uses GitLab as the defensive fallback for an unknown runtime value", () => {
    const settings = config("gitlab");
    settings.provider = "future" as IssueIntegrationSettings["provider"];

    expect(createIssueProvider(settings, "secret")).toEqual({ kind: "gitlab" });
    expect(factories.gitlab).toHaveBeenCalledWith(settings, "secret", "");
  });
});
