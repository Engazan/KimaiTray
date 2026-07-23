export type IssueProviderType = "gitlab" | "github" | "gitea";
export type IssueState = "opened" | "all";
export type LabelFilterMode = "include" | "exclude";

export interface IssueIntegrationSettings {
  enabled: boolean;
  provider: IssueProviderType;
  baseUrl: string;
  apiBaseUrl: string;
  projectPathOrRepo: string;
  defaultState: IssueState;
  assigneeOnly: boolean;
  syncTime: boolean;
  autoInsertUrl: boolean;
  showTimeEstimate: boolean;
  filterLabels: string[];
  filterLabelsMode: LabelFilterMode;
}

export interface ExternalIssue {
  id: number;
  title: string;
  state: string;
  webUrl: string;
  labels: string[];
  author: string;
  /** Estimated time in seconds (GitLab time_stats). Undefined if unsupported/unset. */
  timeEstimate?: number;
  /** Total time already spent in seconds (GitLab time_stats). */
  timeSpent?: number;
}

export interface ExternalLabel {
  name: string;
  color: string;
}

export interface ExternalRepo {
  /** Identifier stored in projectPathOrRepo (GitLab path, GitHub/Gitea owner/repo). */
  id: string;
  label: string;
}

export interface IssueProvider {
  testConnection(): Promise<{
    success: boolean;
    count?: number;
    error?: string;
  }>;
  searchIssues(query: string): Promise<ExternalIssue[]>;
  getIssueUrl(issue: ExternalIssue): string;
  /** Fetch a single issue (including current time stats) from its web URL.
   *  Used to restore the linked issue for a timer started in a previous session. */
  fetchIssueByUrl?(url: string): Promise<ExternalIssue | null>;
  addSpentTime?(issueId: number, durationSeconds: number): Promise<void>;
  fetchLabels?(): Promise<ExternalLabel[]>;
  fetchRepos?(): Promise<ExternalRepo[]>;
}
