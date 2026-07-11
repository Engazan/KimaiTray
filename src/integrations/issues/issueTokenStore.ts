import { saveApiToken, getApiToken, deleteApiToken } from "../../api/secureStore";

function issueTokenKey(connectionId: string): string {
  return `issue-token:${connectionId}`;
}

export async function saveIssueToken(
  connectionId: string,
  token: string,
): Promise<void> {
  if (!connectionId || !token) return;
  return saveApiToken(issueTokenKey(connectionId), token);
}

export async function getIssueToken(
  connectionId: string,
): Promise<string | null> {
  if (!connectionId) return null;
  return getApiToken(issueTokenKey(connectionId));
}

export async function deleteIssueToken(
  connectionId: string,
): Promise<void> {
  if (!connectionId) return;
  return deleteApiToken(issueTokenKey(connectionId));
}
