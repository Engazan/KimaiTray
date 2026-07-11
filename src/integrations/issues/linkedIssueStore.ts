import type { ExternalIssue } from "./types";

const LINKED_ISSUE_KEY_PREFIX = "kimai:linkedIssue";
const LINKED_ISSUE_BY_KEY_PREFIX = "kimai:linkedIssueByKey";

const scopedStorageKey = (prefix: string, connectionId: string) =>
  `${prefix}:${encodeURIComponent(connectionId)}`;

function isExternalIssue(value: unknown): value is ExternalIssue {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const issue = value as Partial<ExternalIssue>;
  return (
    typeof issue.id === "number" &&
    Number.isFinite(issue.id) &&
    typeof issue.title === "string" &&
    typeof issue.state === "string" &&
    typeof issue.webUrl === "string" &&
    Array.isArray(issue.labels) &&
    issue.labels.every((label) => typeof label === "string") &&
    typeof issue.author === "string"
  );
}

export const taskKeyOf = (projectId: number, activityId: number) =>
  `${projectId}-${activityId}`;

export function readLinkedIssueMap(
  connectionId: string,
): Record<string, ExternalIssue> {
  if (!connectionId) return {};
  try {
    const raw = localStorage.getItem(
      scopedStorageKey(LINKED_ISSUE_BY_KEY_PREFIX, connectionId),
    );
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    return Object.fromEntries(
      Object.entries(parsed).filter((entry): entry is [string, ExternalIssue] =>
        isExternalIssue(entry[1]),
      ),
    );
  } catch {
    return {};
  }
}

export function storeLinkedIssueForTask(
  connectionId: string,
  key: string,
  issue: ExternalIssue,
): void {
  if (!connectionId || !key) return;
  try {
    const map = readLinkedIssueMap(connectionId);
    map[key] = issue;
    localStorage.setItem(
      scopedStorageKey(LINKED_ISSUE_BY_KEY_PREFIX, connectionId),
      JSON.stringify(map),
    );
  } catch {
    // Storage is best-effort; timers must keep working when it is unavailable.
  }
}

export function storeLinkedIssueForTimer(
  connectionId: string,
  timerId: number,
  issue: ExternalIssue,
): void {
  if (!connectionId || !Number.isFinite(timerId)) return;
  try {
    localStorage.setItem(
      scopedStorageKey(LINKED_ISSUE_KEY_PREFIX, connectionId),
      JSON.stringify({ timerId, issue }),
    );
  } catch {
    // Storage is best-effort; timers must keep working when it is unavailable.
  }
}

export function readLinkedIssueForTimer(
  connectionId: string,
  timerId: number,
): ExternalIssue | null {
  if (!connectionId || !Number.isFinite(timerId)) return null;
  try {
    const raw = localStorage.getItem(
      scopedStorageKey(LINKED_ISSUE_KEY_PREFIX, connectionId),
    );
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
    const stored = parsed as { timerId?: unknown; issue?: unknown };
    return stored.timerId === timerId && isExternalIssue(stored.issue)
      ? stored.issue
      : null;
  } catch {
    return null;
  }
}
