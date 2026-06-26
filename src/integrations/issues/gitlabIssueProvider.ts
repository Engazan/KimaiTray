import { fetch } from "@tauri-apps/plugin-http";
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
      headers: {
        "PRIVATE-TOKEN": token,
        Accept: "application/json",
      },
    });

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      logger.error(`GitLab API ${res.status}: ${body.slice(0, 200)}`);
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
      const params: Record<string, string> = {
        per_page: "20",
        order_by: "updated_at",
      };
      if (config.defaultState !== "all") {
        params.state = "opened";
      }
      if (config.assigneeOnly) {
        params.scope = "assigned_to_me";
      }
      if (query.length >= 2) {
        params.search = query;
      }
      if (config.filterLabels?.length) {
        if (config.filterLabelsMode === "exclude") {
          params["not[labels]"] = config.filterLabels.join(",");
        } else {
          params.labels = config.filterLabels.join(",");
        }
      }

      const issues = await request<GitLabIssue[]>(
        `/projects/${encodedPath}/issues`,
        params,
      );
      return issues.map(normalize);
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
          headers: {
            "PRIVATE-TOKEN": token,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ duration }),
        },
      );

      if (!res.ok) {
        const body = await res.text().catch(() => "");
        logger.error(`GitLab add_spent_time ${res.status}: ${body.slice(0, 200)}`);
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
