import type { IssueIntegrationSettings, IssueProvider } from "./types";
import { createGitLabProvider } from "./gitlabIssueProvider";
import { createGitHubProvider } from "./githubIssueProvider";
import { createGiteaProvider } from "./giteaIssueProvider";

export function createIssueProvider(
  config: IssueIntegrationSettings,
  token: string,
  connectionId = "",
): IssueProvider {
  if (config.provider === "github") {
    return createGitHubProvider(config, token, connectionId);
  }
  if (config.provider === "gitea") {
    return createGiteaProvider(config, token, connectionId);
  }
  return createGitLabProvider(config, token, connectionId);
}
