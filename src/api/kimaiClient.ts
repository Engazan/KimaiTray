import { safeHttpFetch } from "./safeHttp";

// ── Error types ────────────────────────────────────────────────

export type KimaiErrorCode =
  | "unauthorized"
  | "forbidden"
  | "not_found"
  | "validation_error"
  | "server_error"
  | "network_error"
  | "parse_error"
  | "unknown";

const STATUS_CODE_MAP: Record<number, KimaiErrorCode> = {
  401: "unauthorized",
  403: "forbidden",
  404: "not_found",
  422: "validation_error",
};

const DEFAULT_MESSAGES: Record<KimaiErrorCode, string> = {
  unauthorized: "Invalid API token or session expired",
  forbidden: "You do not have permission for this action",
  not_found: "Resource not found",
  validation_error: "Invalid request data",
  server_error: "Kimai server error",
  network_error: "Could not reach the Kimai server",
  parse_error: "Failed to parse server response",
  unknown: "Unexpected error",
};

export class KimaiApiError extends Error {
  readonly name = "KimaiApiError";
  method?: string;
  path?: string;

  constructor(
    readonly status: number,
    readonly statusText: string,
    readonly body: unknown,
    readonly code: KimaiErrorCode,
  ) {
    super(KimaiApiError.buildMessage(status, code, body));
  }

  get isAuth(): boolean {
    return this.code === "unauthorized" || this.code === "forbidden";
  }

  get endpoint(): string | undefined {
    if (!this.method || !this.path) return undefined;
    return `${this.method} ${this.path}`;
  }

  static fromResponse(
    status: number,
    statusText: string,
    body: unknown,
  ): KimaiApiError {
    const code =
      STATUS_CODE_MAP[status] ?? (status >= 500 ? "server_error" : "unknown");
    return new KimaiApiError(status, statusText, body, code);
  }

  private static buildMessage(
    status: number,
    code: KimaiErrorCode,
    body: unknown,
  ): string {
    if (
      body &&
      typeof body === "object" &&
      "message" in body &&
      typeof (body as Record<string, unknown>).message === "string"
    ) {
      return (body as { message: string }).message;
    }
    const base = DEFAULT_MESSAGES[code];
    return code === "unknown" ? `${base} (HTTP ${status})` : base;
  }
}

// ── URL helpers ────────────────────────────────────────────────

export function normalizeBaseUrl(url: string): string {
  return url.trim().replace(/\/+$/, "");
}

export type QueryParams = Record<
  string,
  string | number | boolean | undefined | null
>;

type QueryParamLike = {
  [key: string]: string | number | boolean | undefined | null;
};

export function buildApiUrl(
  baseUrl: string,
  path: string,
  params?: QueryParams,
): string {
  let url = `${baseUrl}${path}`;
  if (params) {
    const entries = Object.entries(params).filter(
      ([, v]) => v !== undefined && v !== null,
    );
    if (entries.length > 0) {
      const sp = new URLSearchParams();
      for (const [k, v] of entries) sp.set(k, String(v));
      url += `?${sp.toString()}`;
    }
  }
  return url;
}

export function isInsecureUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    if (parsed.protocol === "https:") return false;
    const host = parsed.hostname;
    return host !== "localhost" && host !== "127.0.0.1" && host !== "::1";
  } catch {
    return true;
  }
}

// ── JSON helpers ───────────────────────────────────────────────

async function safeParseJson(response: Response): Promise<unknown> {
  try {
    const text = await response.text();
    if (!text) return null;
    return JSON.parse(text);
  } catch {
    return null;
  }
}

// ── Core request ───────────────────────────────────────────────

async function request<T>(
  baseUrl: string,
  token: string,
  method: string,
  path: string,
  body?: unknown,
  params?: QueryParams,
): Promise<T> {
  const url = buildApiUrl(baseUrl, path, params);

  const withEndpoint = (err: KimaiApiError): KimaiApiError => {
    err.method = method;
    err.path = path;
    return err;
  };

  let response: Response;
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 30_000);
  try {
    response = await safeHttpFetch(url, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });
  } catch {
    throw withEndpoint(
      new KimaiApiError(0, "Network Error", null, "network_error"),
    );
  } finally {
    window.clearTimeout(timeout);
  }

  if (!response.ok) {
    const parsed = await safeParseJson(response);
    throw withEndpoint(
      KimaiApiError.fromResponse(response.status, response.statusText, parsed),
    );
  }

  if (response.status === 204) return undefined as T;

  const data = await safeParseJson(response);
  if (data === null) {
    throw withEndpoint(
      new KimaiApiError(response.status, "Parse Error", null, "parse_error"),
    );
  }

  return data as T;
}

// ── Client interface ───────────────────────────────────────────

export interface KimaiClient {
  readonly baseUrl: string;
  /** Identity of the connection this client belongs to. Used to partition
   *  React Query caches so two connections to the same server (same baseUrl)
   *  but different tokens/options don't share cached data. */
  readonly connectionId: string;
  get<T>(path: string, params?: QueryParamLike): Promise<T>;
  post<T>(path: string, body?: unknown): Promise<T>;
  patch<T>(path: string, body?: unknown): Promise<T>;
  del(path: string): Promise<void>;
}

export function expectArrayResponse<T>(value: unknown, path: string): T[] {
  if (Array.isArray(value)) return value as T[];
  const error = new KimaiApiError(
    200,
    "Parse Error",
    null,
    "parse_error",
  );
  error.method = "GET";
  error.path = path;
  throw error;
}

export function expectObjectResponse<T>(
  value: unknown,
  path: string,
  method = "GET",
): T {
  if (value !== null && typeof value === "object" && !Array.isArray(value)) {
    return value as T;
  }
  const error = new KimaiApiError(200, "Parse Error", null, "parse_error");
  error.method = method;
  error.path = path;
  throw error;
}

export function createKimaiClient(
  rawBaseUrl: string,
  token: string,
  connectionId = "",
): KimaiClient {
  const baseUrl = normalizeBaseUrl(rawBaseUrl);
  return {
    baseUrl,
    connectionId,
    get: <T>(path: string, params?: QueryParamLike) =>
      request<T>(baseUrl, token, "GET", path, undefined, params as QueryParams),
    post: <T>(path: string, body?: unknown) =>
      request<T>(baseUrl, token, "POST", path, body),
    patch: <T>(path: string, body?: unknown) =>
      request<T>(baseUrl, token, "PATCH", path, body),
    del: (path: string) =>
      request<void>(baseUrl, token, "DELETE", path),
  };
}
