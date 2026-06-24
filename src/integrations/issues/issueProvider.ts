import type { IssueIntegrationSettings, IssueProvider } from "./types";
import { createGitLabProvider } from "./gitlabIssueProvider";
import { createGitHubProvider } from "./githubIssueProvider";
import { createGiteaProvider } from "./giteaIssueProvider";

export function createIssueProvider(
  config: IssueIntegrationSettings,
  token: string,
): IssueProvider {
  if (config.provider === "github") {
    return createGitHubProvider(config, token);
  }
  if (config.provider === "gitea") {
    return createGiteaProvider(config, token);
  }
  return createGitLabProvider(config, token);
}
