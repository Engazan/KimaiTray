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
}

export interface ExternalLabel {
  name: string;
  color: string;
}

export interface IssueProvider {
  testConnection(): Promise<{
    success: boolean;
    count?: number;
    error?: string;
  }>;
  searchIssues(query: string): Promise<ExternalIssue[]>;
  getIssueUrl(issue: ExternalIssue): string;
  addSpentTime?(issueId: number, durationSeconds: number): Promise<void>;
  fetchLabels?(): Promise<ExternalLabel[]>;
}
