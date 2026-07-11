// ── Kimai REST API response types ──────────────────────────────

export interface KimaiVersion {
  version: string;
  versionId: number;
  copyright: string;
}

export interface KimaiUser {
  id: number;
  username: string;
  alias: string | null;
  email: string;
  language: string;
  timezone: string;
  enabled: boolean;
  accountNumber: string | null;
}

export interface KimaiCustomer {
  id: number;
  name: string;
  visible: boolean;
  color: string | null;
  comment: string | null;
  country: string;
  currency: string;
  number: string | null;
}

export interface KimaiProject {
  id: number;
  name: string;
  customer: number;
  visible: boolean;
  billable: boolean;
  color: string | null;
  comment: string | null;
  globalActivities: boolean;
}

export interface KimaiActivity {
  id: number;
  name: string;
  project: number | null;
  visible: boolean;
  billable: boolean;
  color: string | null;
  comment: string | null;
}

export interface KimaiTimesheetEntry {
  id: number;
  begin: string;
  end: string | null;
  duration: number | null;
  description: string;
  rate: number;
  internalRate: number;
  exported: boolean;
  billable: boolean;
  tags: string[];
  activity: number | { id: number };
  project: number | { id: number };
  user: number | { id: number };
}

export function extractId(val: number | { id: number }): number {
  return typeof val === "number" ? val : val.id;
}

// ── Request payloads ───────────────────────────────────────────

export interface KimaiTimesheetCreate {
  project: number;
  activity: number;
  begin?: string;
  description?: string;
  tags?: string;
}

export interface KimaiTimesheetUpdate {
  begin?: string;
  end?: string;
  project?: number;
  activity?: number;
  description?: string;
  tags?: string;
}

// ── Query parameters ───────────────────────────────────────────

export type TimesheetListParams = {
  user?: string;
  customer?: number;
  project?: number;
  activity?: number;
  active?: "1" | "0";
  exported?: "1" | "0";
  orderBy?: "begin" | "end" | "duration" | "rate";
  order?: "ASC" | "DESC";
  begin?: string;
  end?: string;
  page?: number;
  size?: number;
};

export type ProjectListParams = {
  customer?: number;
  visible?: "1" | "2" | "3";
  order?: "ASC" | "DESC";
  orderBy?: "id" | "name" | "customer";
};

export type ActivityListParams = {
  project?: number;
  visible?: "1" | "2" | "3";
  order?: "ASC" | "DESC";
  orderBy?: "id" | "name" | "project";
};

export type CustomerListParams = {
  visible?: "1" | "2" | "3";
  order?: "ASC" | "DESC";
  orderBy?: "id" | "name";
};
