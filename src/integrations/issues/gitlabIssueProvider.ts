import { safeHttpFetch as fetch } from "../../api/safeHttp";
import type { ExternalIssue, ExternalLabel, ExternalRepo, IssueProvider, IssueIntegrationSettings } from "./types";
import { logger } from "../../utils/logger";

interface GitLabIssue {
  iid: number;
  title: string;
  state: string;
  web_url: string;
  labels: string[];
  author: { username: string };
  time_stats?: {
    time_estimate: number;
    total_time_spent: number;
  };
}

interface GitLabLabel {
  name: string;
  color: string;
}

// Case- and diacritic-insensitive normalization so a query like "sik" or
// "individualne" matches "siklienka" / "Individuálne".
function normalizeText(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function normalize(issue: GitLabIssue): ExternalIssue {
  return {
    id: issue.iid,
    title: issue.title,
    state: issue.state,
    webUrl: issue.web_url,
    labels: issue.labels,
    author: issue.author?.username ?? "",
    timeEstimate: issue.time_stats?.time_estimate || undefined,
    timeSpent: issue.time_stats?.total_time_spent || undefined,
  };
}

export function createGitLabProvider(
  config: IssueIntegrationSettings,
  token: string,
): IssueProvider {
  const base = config.baseUrl.replace(/\/+$/, "");
  const encodedPath = encodeURIComponent(config.projectPathOrRepo);

  async function request<T>(path: string, params?: Record<string, string>): Promise<T> {
    const url = new URL(`${base}/api/v4${path}`);
    if (params) {
      for (const [k, v] of Object.entries(params)) {
        if (v) url.searchParams.set(k, v);
      }
    }

    const res = await fetch(url.toString(), {
      signal: AbortSignal.timeout(30_000),
      headers: {
        "PRIVATE-TOKEN": token,
        Accept: "application/json",
      },
    });

    if (!res.ok) {
      logger.error(`GitLab API request failed with status ${res.status}`);
      throw new Error(`GitLab API error: ${res.status} ${res.statusText}`);
    }

    return res.json() as Promise<T>;
  }

  return {
    async testConnection() {
      try {
        const issues = await request<GitLabIssue[]>(
          `/projects/${encodedPath}/issues`,
          { per_page: "1", state: config.defaultState === "all" ? "" : "opened" },
        );
        return { success: true, count: issues.length };
      } catch (err) {
        return {
          success: false,
          error: err instanceof Error ? err.message : String(err),
        };
      }
    },

    async searchIssues(query: string) {
      const baseParams: Record<string, string> = {
        per_page: "20",
        order_by: "updated_at",
      };
      if (config.defaultState !== "all") {
        baseParams.state = "opened";
      }
      if (config.assigneeOnly) {
        baseParams.scope = "assigned_to_me";
      }
      if (config.filterLabels?.length) {
        if (config.filterLabelsMode === "exclude") {
          baseParams["not[labels]"] = config.filterLabels.join(",");
        } else {
          baseParams.labels = config.filterLabels.join(",");
        }
      }

      const path = `/projects/${encodedPath}/issues`;
      const trimmed = query.trim();

      if (trimmed.length < 2) {
        const issues = await request<GitLabIssue[]>(path, baseParams);
        return issues.map(normalize);
      }

      // GitLab's server-side `search` matches whole words/tokens, so a substring
      // like "sik" won't match "siklienka". We fetch a wider recent window and
      // filter client-side for substring matches (diacritic-insensitive), while
      // still running the server search to catch matches outside that window.
      const [serverMatched, recent] = await Promise.all([
        request<GitLabIssue[]>(path, { ...baseParams, search: trimmed }),
        request<GitLabIssue[]>(path, { ...baseParams, per_page: "100" }),
      ]);

      const needle = normalizeText(trimmed);
      const localMatched = recent.filter((issue) =>
        normalizeText(issue.title).includes(needle),
      );

      const seen = new Set<number>();
      const merged: GitLabIssue[] = [];
      for (const issue of [...serverMatched, ...localMatched]) {
        if (!seen.has(issue.iid)) {
          seen.add(issue.iid);
          merged.push(issue);
        }
      }

      return merged.slice(0, 20).map(normalize);
    },

    getIssueUrl(issue: ExternalIssue) {
      return `${base}/${config.projectPathOrRepo}/-/issues/${issue.id}`;
    },

    async fetchIssueByUrl(url: string): Promise<ExternalIssue | null> {
      // GitLab issue URLs look like: {base}/{group/project}/-/issues/{iid}
      const match = url.match(/^(.*)\/-\/issues\/(\d+)/);
      if (!match) return null;
      const projectPath = match[1].slice(base.length).replace(/^\/+/, "");
      const iid = match[2];
      if (!projectPath) return null;
      try {
        const issue = await request<GitLabIssue>(
          `/projects/${encodeURIComponent(projectPath)}/issues/${iid}`,
        );
        return normalize(issue);
      } catch (err) {
        logger.error(
          `GitLab fetchIssueByUrl failed: ${err instanceof Error ? err.message : String(err)}`,
        );
        return null;
      }
    },

    async addSpentTime(issueId: number, durationSeconds: number) {
      if (durationSeconds < 60) return;
      const hours = Math.floor(durationSeconds / 3600);
      const minutes = Math.floor((durationSeconds % 3600) / 60);
      const duration = hours > 0 ? `${hours}h${minutes}m` : `${minutes}m`;

      const res = await fetch(
        `${base}/api/v4/projects/${encodedPath}/issues/${issueId}/add_spent_time`,
        {
          method: "POST",
          signal: AbortSignal.timeout(30_000),
          headers: {
            "PRIVATE-TOKEN": token,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ duration }),
        },
      );

      if (!res.ok) {
        logger.error(`GitLab add_spent_time failed with status ${res.status}`);
        throw new Error(`Failed to log time: ${res.status}`);
      }

      logger.info(`Logged ${duration} on GitLab issue #${issueId}`);
    },

    async fetchLabels(): Promise<ExternalLabel[]> {
      const labels = await request<GitLabLabel[]>(
        `/projects/${encodedPath}/labels`,
        { per_page: "100" },
      );
      return labels.map((l) => ({ name: l.name, color: l.color }));
    },

    async fetchRepos(): Promise<ExternalRepo[]> {
      const projects = await request<Array<{ path_with_namespace: string }>>(
        "/projects",
        {
          membership: "true",
          simple: "true",
          per_page: "100",
          order_by: "last_activity_at",
          sort: "desc",
        },
      );
      return projects.map((p) => ({
        id: p.path_with_namespace,
        label: p.path_with_namespace,
      }));
    },
  };
}
