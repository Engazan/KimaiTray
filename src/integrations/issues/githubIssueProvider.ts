import { safeHttpFetch as fetch } from "../../api/safeHttp";
import type { ExternalIssue, ExternalLabel, ExternalRepo, IssueProvider, IssueIntegrationSettings } from "./types";
import { logger } from "../../utils/logger";
import { expectArrayOf, expectObject, isRecord } from "./responseValidation";

interface GitHubIssue {
  number: number;
  title: string;
  state: string;
  html_url: string;
  labels: Array<{ name: string }>;
  user: { login: string } | null;
  pull_request?: unknown;
}

interface GitHubSearchResult {
  items: GitHubIssue[];
}

interface GitHubLabel {
  name: string;
  color: string;
}

interface GitHubRepo {
  full_name: string;
}

function isGitHubIssue(value: unknown): value is GitHubIssue {
  return (
    isRecord(value) &&
    typeof value.number === "number" &&
    typeof value.title === "string" &&
    typeof value.state === "string" &&
    typeof value.html_url === "string" &&
    Array.isArray(value.labels) &&
    value.labels.every(
      (label) => isRecord(label) && typeof label.name === "string",
    ) &&
    (value.user === null ||
      (isRecord(value.user) && typeof value.user.login === "string"))
  );
}

function isGitHubSearchResult(value: unknown): value is GitHubSearchResult {
  return (
    isRecord(value) &&
    Array.isArray(value.items) &&
    value.items.every(isGitHubIssue)
  );
}

function isGitHubLabel(value: unknown): value is GitHubLabel {
  return (
    isRecord(value) &&
    typeof value.name === "string" &&
    typeof value.color === "string"
  );
}

function isGitHubRepo(value: unknown): value is GitHubRepo {
  return isRecord(value) && typeof value.full_name === "string";
}

function isGitHubUser(value: unknown): value is { login: string } {
  return isRecord(value) && typeof value.login === "string";
}

function normalize(issue: GitHubIssue): ExternalIssue {
  return {
    id: issue.number,
    title: issue.title,
    state: issue.state,
    webUrl: issue.html_url,
    labels: issue.labels.map((l) => l.name),
    author: issue.user?.login ?? "",
  };
}

export function createGitHubProvider(
  config: IssueIntegrationSettings,
  token: string,
): IssueProvider {
  const apiBase = (config.apiBaseUrl || "https://api.github.com").replace(/\/+$/, "");
  const allowedOrigin = new URL(apiBase).origin;
  let cachedUsername: string | null = null;

  async function request(path: string, params?: Record<string, string>): Promise<unknown> {
    const url = new URL(`${apiBase}${path}`);
    if (params) {
      for (const [k, v] of Object.entries(params)) {
        if (v) url.searchParams.set(k, v);
      }
    }

    const res = await fetch(url.toString(), {
      allowedOrigin,
      signal: AbortSignal.timeout(30_000),
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github+json",
      },
    });

    if (!res.ok) {
      logger.error(`GitHub API request failed with status ${res.status}`);
      throw new Error(`GitHub API error: ${res.status} ${res.statusText}`);
    }

    return res.json() as Promise<unknown>;
  }

  async function getUsername(): Promise<string> {
    if (cachedUsername) return cachedUsername;
    const user = expectObject(await request("/user"), isGitHubUser, "GitHub user");
    cachedUsername = user.login;
    return cachedUsername;
  }

  return {
    async testConnection() {
      try {
        const issues = expectArrayOf(
          await request(`/repos/${config.projectPathOrRepo}/issues`, {
            per_page: "1",
            state: config.defaultState === "all" ? "all" : "open",
          }),
          isGitHubIssue,
          "GitHub issues",
        );
        const filtered = issues.filter((i) => !i.pull_request);
        return { success: true, count: filtered.length };
      } catch (err) {
        return {
          success: false,
          error: err instanceof Error ? err.message : String(err),
        };
      }
    },

    async searchIssues(query: string) {
      const assignee = config.assigneeOnly ? await getUsername() : "";

      const isExclude = config.filterLabelsMode === "exclude";
      const labelFilter = config.filterLabels?.length
        ? config.filterLabels.map((l) => isExclude ? `+-label:"${l}"` : `+label:"${l}"`).join("")
        : "";

      if (query.length >= 2) {
        const stateFilter = config.defaultState === "all" ? "" : "+state:open";
        const assigneeFilter = assignee ? `+assignee:${assignee}` : "";
        const result = expectObject(
          await request("/search/issues", {
            q: `${query}+repo:${config.projectPathOrRepo}+is:issue${stateFilter}${assigneeFilter}${labelFilter}`,
            per_page: "20",
          }),
          isGitHubSearchResult,
          "GitHub issue search",
        );
        return result.items.filter((i) => !i.pull_request).map(normalize);
      }

      const params: Record<string, string> = {
        per_page: "20",
        state: config.defaultState === "all" ? "all" : "open",
        sort: "updated",
        direction: "desc",
      };
      if (assignee) {
        params.assignee = assignee;
      }
      if (config.filterLabels?.length && !isExclude) {
        params.labels = config.filterLabels.join(",");
      }

      const issues = expectArrayOf(
        await request(`/repos/${config.projectPathOrRepo}/issues`, params),
        isGitHubIssue,
        "GitHub issues",
      );
      const filtered = issues.filter((i) => !i.pull_request);
      if (isExclude && config.filterLabels?.length) {
        const excluded = new Set(config.filterLabels);
        return filtered.filter((i) => !i.labels.some((l) => excluded.has(l.name))).map(normalize);
      }
      return filtered.map(normalize);
    },

    getIssueUrl(issue: ExternalIssue) {
      return issue.webUrl;
    },

    async fetchLabels(): Promise<ExternalLabel[]> {
      const labels = expectArrayOf(
        await request(`/repos/${config.projectPathOrRepo}/labels`, {
          per_page: "100",
        }),
        isGitHubLabel,
        "GitHub labels",
      );
      return labels.map((l) => ({ name: l.name, color: `#${l.color}` }));
    },

    async fetchRepos(): Promise<ExternalRepo[]> {
      const repos = expectArrayOf(
        await request("/user/repos", { per_page: "100", sort: "updated" }),
        isGitHubRepo,
        "GitHub repositories",
      );
      return repos.map((r) => ({ id: r.full_name, label: r.full_name }));
    },
  };
}
