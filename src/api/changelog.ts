export interface ChangelogEntry {
  version: string;
  body: string;
}

const PENDING_CHANGELOG_KEY = "kimai:pendingChangelog";
const MAX_VERSION_LENGTH = 64;
const MAX_BODY_LENGTH = 100_000;

function isChangelogEntry(value: unknown): value is ChangelogEntry {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const entry = value as Partial<ChangelogEntry>;
  return (
    typeof entry.version === "string" &&
    entry.version.length > 0 &&
    entry.version.length <= MAX_VERSION_LENGTH &&
    typeof entry.body === "string" &&
    entry.body.length <= MAX_BODY_LENGTH
  );
}

function removePendingChangelog(): void {
  try {
    localStorage.removeItem(PENDING_CHANGELOG_KEY);
  } catch {
    // Storage is optional; callers must keep working when it is unavailable.
  }
}

/** Persist updater metadata across the relaunch into the newly installed app. */
export function rememberPendingChangelog(entry: ChangelogEntry): void {
  if (!isChangelogEntry(entry) || typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(PENDING_CHANGELOG_KEY, JSON.stringify(entry));
  } catch {
    // Changelog persistence is best-effort and must never prevent an update.
  }
}

export function forgetPendingChangelog(version: string): void {
  if (typeof localStorage === "undefined") return;
  try {
    const raw = localStorage.getItem(PENDING_CHANGELOG_KEY);
    if (!raw) return;
    const parsed: unknown = JSON.parse(raw);
    if (isChangelogEntry(parsed) && parsed.version === version) {
      removePendingChangelog();
    }
  } catch {
    removePendingChangelog();
  }
}

/** Return and consume release notes only after their target version is running. */
export function claimInstalledChangelog(
  installedVersion: string,
): ChangelogEntry | null {
  if (!installedVersion || typeof localStorage === "undefined") return null;
  try {
    const raw = localStorage.getItem(PENDING_CHANGELOG_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (!isChangelogEntry(parsed)) {
      removePendingChangelog();
      return null;
    }
    if (parsed.version !== installedVersion) return null;
    removePendingChangelog();
    return parsed;
  } catch {
    removePendingChangelog();
    return null;
  }
}

/** Extract one version from the repository changelog for the Test preview. */
export function extractVersionChangelog(
  changelog: string,
  version: string,
): string | null {
  if (!version) return null;
  const lines = changelog.split(/\r?\n/);
  const escapedVersion = version.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const heading = new RegExp(`^## \\[?${escapedVersion}\\]?(?:\\s+-.*)?\\s*$`);
  const start = lines.findIndex((line) => heading.test(line.trim()));
  if (start < 0) return null;
  const next = lines.findIndex(
    (line, index) => index > start && /^##\s+/.test(line.trim()),
  );
  const body = lines.slice(start + 1, next < 0 ? undefined : next).join("\n").trim();
  return body || null;
}
