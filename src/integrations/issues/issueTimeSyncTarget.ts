import { SpentTimeRejectedError } from "./spentTimeError";
import type { IssueIntegrationSettings } from "./types";

/** Derive the actual repository from the issue link; issue numbers are local
 * to a project, so the currently selected repository alone is not sufficient.
 */
export function issueTimeSyncTarget(config: IssueIntegrationSettings, issueUrl: string, issueId: number): string {
  try {
    const base = new URL(config.baseUrl);
    const issue = new URL(issueUrl);
    const basePath = base.pathname.replace(/\/+$/, "");
    if (!['https:', 'http:'].includes(issue.protocol) || issue.origin !== base.origin ||
      issue.username || issue.password || !issue.pathname.startsWith(`${basePath}/`)) throw new Error();
    const path = issue.pathname.slice(basePath.length);
    const match = config.provider === "gitlab"
      ? path.match(/^\/(.+)\/-\/issues\/(\d+)\/?$/)
      : path.match(/^\/([^/]+\/[^/]+)\/issues\/(\d+)\/?$/);
    if (!match || Number(match[2]) !== issueId) throw new Error();
    const segments = match[1].split("/").map(decodeURIComponent);
    if (segments.some((segment) => !segment || segment.includes("/") || segment === "." || segment === "..")) throw new Error();
    return segments.join("/");
  } catch {
    // No POST has been attempted: the queue can safely leave this pending.
    throw new SpentTimeRejectedError(422);
  }
}
