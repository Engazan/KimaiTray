export interface ChangelogEntry {
  version: string;
  body: string;
}

const PENDING_CHANGELOG_KEY = "kimai:pendingChangelog";
const QUEUED_CHANGELOG_KEY = "kimai:queuedChangelogWindow";
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

function readStoredChangelog(key: string): ChangelogEntry | null {
  if (typeof localStorage === "undefined") return null;
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (isChangelogEntry(parsed)) return parsed;
    localStorage.removeItem(key);
  } catch {
    try {
      localStorage.removeItem(key);
    } catch {
      // Storage is optional; callers must keep working when it is unavailable.
    }
  }
  return null;
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

/** Stage content before its dedicated webview is created. */
export function queueChangelogWindow(entry: ChangelogEntry): boolean {
  if (!isChangelogEntry(entry) || typeof localStorage === "undefined") return false;
  try {
    localStorage.setItem(QUEUED_CHANGELOG_KEY, JSON.stringify(entry));
    return true;
  } catch {
    return false;
  }
}

/** Read staged content without consuming it during React Strict Mode renders. */
export function readQueuedChangelogWindow(): ChangelogEntry | null {
  return readStoredChangelog(QUEUED_CHANGELOG_KEY);
}

/** Consume only the content that this webview successfully displayed. */
export function forgetQueuedChangelogWindow(entry: ChangelogEntry): void {
  const queued = readStoredChangelog(QUEUED_CHANGELOG_KEY);
  if (!queued || queued.version !== entry.version || queued.body !== entry.body) return;
  try {
    localStorage.removeItem(QUEUED_CHANGELOG_KEY);
  } catch {
    // Storage is optional; callers must keep working when it is unavailable.
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
