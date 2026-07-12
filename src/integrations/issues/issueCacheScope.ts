interface IssueCredentialSession {
  token: string | null;
  scope: string;
}

const sessions = new Map<string, IssueCredentialSession>();
let nextSession = 1;

export function resolveIssueCacheScope(
  connectionId: string,
  token: string | null,
): string {
  const identity = connectionId || "unconfigured";
  const current = sessions.get(identity);
  if (current?.token === token) return current.scope;

  const scope = `${identity}:${nextSession++}`;
  sessions.set(identity, { token, scope });
  return scope;
}
