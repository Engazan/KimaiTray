import { safeHttpFetch as fetch } from "../../api/safeHttp";
import type { ExternalIssue, ExternalLabel, ExternalRepo, IssueProvider, IssueIntegrationSettings } from "./types";
import { logger } from "../../utils/logger";
import { expectArrayOf, expectObject, isRecord } from "./responseValidation";

interface GiteaIssue {
  number: number;
  title: string;
  state: string;
  html_url: string;
  labels: Array<{ name: string; color: string }>;
  user: { login: string } | null;
}

interface GiteaLabel {
  name: string;
  color: string;
}

interface GiteaRepo {
  full_name: string;
}

function isGiteaIssue(value: unknown): value is GiteaIssue {
  return (
    isRecord(value) &&
    typeof value.number === "number" &&
    typeof value.title === "string" &&
    typeof value.state === "string" &&
    typeof value.html_url === "string" &&
    Array.isArray(value.labels) &&
    value.labels.every(
      (label) =>
        isRecord(label) &&
        typeof label.name === "string" &&
        typeof label.color === "string",
    ) &&
    (value.user === null ||
      (isRecord(value.user) && typeof value.user.login === "string"))
  );
}

function isGiteaLabel(value: unknown): value is GiteaLabel {
  return (
    isRecord(value) &&
    typeof value.name === "string" &&
    typeof value.color === "string"
  );
}

function isGiteaRepo(value: unknown): value is GiteaRepo {
  return isRecord(value) && typeof value.full_name === "string";
}

function isGiteaUser(value: unknown): value is { login: string } {
  return isRecord(value) && typeof value.login === "string";
}

function normalize(issue: GiteaIssue): ExternalIssue {
  return {
    id: issue.number,
    title: issue.title,
    state: issue.state,
    webUrl: issue.html_url,
    labels: issue.labels?.map((l) => l.name) ?? [],
    author: issue.user?.login ?? "",
  };
}

function normalizeColor(color: string): string {
  return `#${color.replace(/^#/, "")}`;
}

export function createGiteaProvider(
  config: IssueIntegrationSettings,
  token: string,
): IssueProvider {
  const base = config.baseUrl.replace(/\/+$/, "");
  const allowedOrigin = new URL(base).origin;
  let cachedUsername: string | null = null;

  async function request(path: string, params?: Record<string, string>): Promise<unknown> {
    const url = new URL(`${base}/api/v1${path}`);
    if (params) {
      for (const [k, v] of Object.entries(params)) {
        if (v) url.searchParams.set(k, v);
      }
    }

    const res = await fetch(url.toString(), {
      allowedOrigin,
      signal: AbortSignal.timeout(30_000),
      headers: {
        Authorization: `token ${token}`,
        Accept: "application/json",
      },
    });

    if (!res.ok) {
      logger.error(`Gitea API request failed with status ${res.status}`);
      throw new Error(`Gitea API error: ${res.status} ${res.statusText}`);
    }

    return res.json() as Promise<unknown>;
  }

  async function getUsername(): Promise<string> {
    if (cachedUsername) return cachedUsername;
    const user = expectObject(await request("/user"), isGiteaUser, "Gitea user");
    cachedUsername = user.login;
    return cachedUsername;
  }

  return {
    async testConnection() {
      try {
        const issues = expectArrayOf(
          await request(`/repos/${config.projectPathOrRepo}/issues`, {
            limit: "1",
            type: "issues",
            state: config.defaultState === "all" ? "all" : "open",
          }),
          isGiteaIssue,
          "Gitea issues",
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
        limit: "20",
        type: "issues",
        state: config.defaultState === "all" ? "all" : "open",
      };
      if (query.length >= 2) {
        params.q = query;
      }
      if (config.assigneeOnly) {
        params.assigned_by = await getUsername();
      }

      const isExclude = config.filterLabelsMode === "exclude";
      if (config.filterLabels?.length && !isExclude) {
        params.labels = config.filterLabels.join(",");
      }

      const issues = expectArrayOf(
        await request(`/repos/${config.projectPathOrRepo}/issues`, params),
        isGiteaIssue,
        "Gitea issues",
      );

      if (isExclude && config.filterLabels?.length) {
        const excluded = new Set(config.filterLabels);
        return issues
          .filter((i) => !i.labels?.some((l) => excluded.has(l.name)))
          .map(normalize);
      }
      return issues.map(normalize);
    },

    getIssueUrl(issue: ExternalIssue) {
      return issue.webUrl;
    },

    async addSpentTime(issueId: number, durationSeconds: number) {
      if (durationSeconds < 60) return;

      const res = await fetch(
        `${base}/api/v1/repos/${config.projectPathOrRepo}/issues/${issueId}/times`,
        {
          allowedOrigin,
          method: "POST",
          signal: AbortSignal.timeout(30_000),
          headers: {
            Authorization: `token ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ time: durationSeconds }),
        },
      );

      if (!res.ok) {
        logger.error(`Gitea add time failed with status ${res.status}`);
        throw new Error(`Failed to log time: ${res.status}`);
      }

      logger.info(`Logged ${durationSeconds}s on Gitea issue #${issueId}`);
    },

    async fetchLabels(): Promise<ExternalLabel[]> {
      const labels = expectArrayOf(
        await request(`/repos/${config.projectPathOrRepo}/labels`, {
          limit: "100",
        }),
        isGiteaLabel,
        "Gitea labels",
      );
      return labels.map((l) => ({ name: l.name, color: normalizeColor(l.color) }));
    },

    async fetchRepos(): Promise<ExternalRepo[]> {
      const repos = expectArrayOf(
        await request("/user/repos", { limit: "50" }),
        isGiteaRepo,
        "Gitea repositories",
      );
      return repos.map((r) => ({ id: r.full_name, label: r.full_name }));
    },
  };
}
