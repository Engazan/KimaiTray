import { safeHttpFetch as fetch } from "../../api/safeHttp";
import type { ExternalIssue, ExternalLabel, ExternalRepo, IssueProvider, IssueIntegrationSettings } from "./types";
import { logger } from "../../utils/logger";

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
  let cachedUsername: string | null = null;

  async function request<T>(path: string, params?: Record<string, string>): Promise<T> {
    const url = new URL(`${apiBase}${path}`);
    if (params) {
      for (const [k, v] of Object.entries(params)) {
        if (v) url.searchParams.set(k, v);
      }
    }

    const res = await fetch(url.toString(), {
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

    return res.json() as Promise<T>;
  }

  async function getUsername(): Promise<string> {
    if (cachedUsername) return cachedUsername;
    const user = await request<{ login: string }>("/user");
    cachedUsername = user.login;
    return cachedUsername;
  }

  return {
    async testConnection() {
      try {
        const issues = await request<GitHubIssue[]>(
          `/repos/${config.projectPathOrRepo}/issues`,
          {
            per_page: "1",
            state: config.defaultState === "all" ? "all" : "open",
          },
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
        const result = await request<GitHubSearchResult>(
          "/search/issues",
          { q: `${query}+repo:${config.projectPathOrRepo}+is:issue${stateFilter}${assigneeFilter}${labelFilter}`, per_page: "20" },
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

      const issues = await request<GitHubIssue[]>(
        `/repos/${config.projectPathOrRepo}/issues`,
        params,
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
      const labels = await request<GitHubLabel[]>(
        `/repos/${config.projectPathOrRepo}/labels`,
        { per_page: "100" },
      );
      return labels.map((l) => ({ name: l.name, color: `#${l.color}` }));
    },

    async fetchRepos(): Promise<ExternalRepo[]> {
      const repos = await request<Array<{ full_name: string }>>(
        "/user/repos",
        { per_page: "100", sort: "updated" },
      );
      return repos.map((r) => ({ id: r.full_name, label: r.full_name }));
    },
  };
}
