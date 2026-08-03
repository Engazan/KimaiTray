export const KIMAITRAY_DEEP_LINK_SCHEME = "kimaitray:";

interface TimerDeepLinkFields {
  connectionId?: string;
  description?: string;
  tags?: string[];
  issueUrl?: string;
  /** Values addressed by an enabled custom input's metadata name or stable id. */
  customFields: Record<string, string>;
}

export interface StartTimerDeepLink extends TimerDeepLinkFields {
  action: "start";
  projectId: number;
  activityId: number;
  begin?: string;
  label?: string;
}

export interface NewTimerDeepLink extends TimerDeepLinkFields {
  action: "new";
}

export type KimaiTrayDeepLink = StartTimerDeepLink | NewTimerDeepLink;

const MAX_URL_LENGTH = 16_384;
const MAX_DESCRIPTION_LENGTH = 4_000;
const MAX_CUSTOM_FIELDS = 32;

function optionalString(
  params: URLSearchParams,
  name: string,
  maxLength: number,
): string | undefined {
  const value = params.get(name)?.trim();
  if (!value) return undefined;
  if (value.length > maxLength) {
    throw new Error(`Deep-link parameter "${name}" is too long`);
  }
  return value;
}

function positiveInteger(params: URLSearchParams, name: string): number {
  const raw = params.get(name);
  if (!raw || !/^\d+$/.test(raw)) {
    throw new Error(`Deep link requires a numeric "${name}" parameter`);
  }
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new Error(`Deep-link parameter "${name}" must be a positive integer`);
  }
  return value;
}

function parseIssueUrl(raw: string | undefined): string | undefined {
  if (!raw) return undefined;
  if (raw.length > 2_048) throw new Error("Deep-link issue URL is too long");
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error("Deep-link issue parameter must be a valid URL");
  }
  if (
    !["http:", "https:"].includes(url.protocol) ||
    url.username !== "" ||
    url.password !== ""
  ) {
    throw new Error("Deep-link issue URL must be an HTTP(S) URL without credentials");
  }
  return url.toString();
}

function parseTags(params: URLSearchParams): string[] | undefined {
  const rawTags = [
    ...params.getAll("tag"),
    ...(params.get("tags")?.split(",") ?? []),
  ];
  const tags = [...new Set(rawTags.map((tag) => tag.trim()).filter(Boolean))];
  if (tags.length > 50 || tags.some((tag) => tag.length > 256)) {
    throw new Error("Deep link contains too many tags or a tag that is too long");
  }
  return tags.length > 0 ? tags : undefined;
}

function parseCustomFields(params: URLSearchParams): Record<string, string> {
  const entries: Array<[string, string]> = [];
  for (const [parameter, rawValue] of params.entries()) {
    if (!parameter.startsWith("custom.")) continue;
    const name = parameter.slice("custom.".length).trim();
    const value = rawValue.trim();
    if (!name || name.length > 256 || value.length > 4_000) {
      throw new Error("Deep link contains an invalid custom plugin field");
    }
    if (value) entries.push([name, value]);
  }
  if (entries.length > MAX_CUSTOM_FIELDS) {
    throw new Error("Deep link contains too many custom plugin fields");
  }
  return Object.fromEntries(entries);
}

export function parseKimaiTrayDeepLink(rawUrl: string): KimaiTrayDeepLink {
  if (rawUrl.length > MAX_URL_LENGTH) throw new Error("Deep link is too long");

  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new Error("KimaiTray received an invalid deep link");
  }
  if (
    url.protocol !== KIMAITRAY_DEEP_LINK_SCHEME ||
    !["start", "new"].includes(url.hostname) ||
    (url.pathname !== "" && url.pathname !== "/")
  ) {
    throw new Error("Unsupported KimaiTray deep-link action");
  }

  const params = url.searchParams;
  const common: TimerDeepLinkFields = {
    connectionId: optionalString(params, "connection", 256),
    description: optionalString(params, "description", MAX_DESCRIPTION_LENGTH),
    tags: parseTags(params),
    issueUrl: parseIssueUrl(optionalString(params, "issue", 2_048)),
    customFields: parseCustomFields(params),
  };
  if (url.hostname === "new") return { action: "new", ...common };
  return {
    action: "start",
    ...common,
    projectId: positiveInteger(params, "project"),
    activityId: positiveInteger(params, "activity"),
    begin: optionalString(params, "begin", 64),
    label: optionalString(params, "label", 256),
  };
}

export function parseStartTimerDeepLink(rawUrl: string): StartTimerDeepLink {
  const parsed = parseKimaiTrayDeepLink(rawUrl);
  if (parsed.action !== "start") {
    throw new Error("Deep link does not start a timer");
  }
  return parsed;
}
