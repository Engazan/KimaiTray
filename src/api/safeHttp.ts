import { invoke } from "@tauri-apps/api/core";

const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);
const MAX_REDIRECTS = 5;

interface NativeHttpResponse {
  status: number;
  statusText: string;
  headers: Array<[string, string]>;
  body: string;
}

function serializeBody(body: BodyInit | null | undefined): string | undefined {
  if (body == null) return undefined;
  if (typeof body === "string") return body;
  if (body instanceof URLSearchParams) return body.toString();
  throw new Error("Unsupported HTTP request body");
}

async function nativeFetch(
  url: string,
  method: string,
  headers: Headers,
  body: BodyInit | null | undefined,
  signal?: AbortSignal | null,
): Promise<Response> {
  if (signal?.aborted) {
    throw signal.reason ?? new DOMException("Request aborted", "AbortError");
  }
  const result = await invoke<NativeHttpResponse>("http_request", {
    request: {
      url,
      method,
      headers: Array.from(headers.entries()),
      body: serializeBody(body),
    },
  });
  const bodyAllowed = ![204, 205, 304].includes(result.status);
  return new Response(bodyAllowed ? result.body : null, {
    status: result.status,
    statusText: result.statusText,
    headers: result.headers,
  });
}

export function resolveSafeRedirect(
  currentUrl: string,
  location: string,
  allowedOrigin: string,
): string {
  const next = new URL(location, currentUrl);
  if (next.origin !== allowedOrigin) {
    throw new Error("Cross-origin HTTP redirect blocked");
  }
  if (new URL(currentUrl).protocol === "https:" && next.protocol !== "https:") {
    throw new Error("HTTPS downgrade redirect blocked");
  }
  return next.toString();
}

/**
 * Tauri HTTP fetch with explicit same-origin redirect handling. Authentication
 * headers are retained only because every followed URL has the original
 * origin; cross-origin and HTTPS downgrade redirects are rejected.
 */
export async function safeHttpFetch(
  input: string | URL,
  init: RequestInit = {},
): Promise<Response> {
  let currentUrl = new URL(input.toString()).toString();
  const allowedOrigin = new URL(currentUrl).origin;
  let method = (init.method ?? "GET").toUpperCase();
  let body = init.body;
  let headers = new Headers(init.headers);

  for (let redirectCount = 0; ; redirectCount += 1) {
    const response = await nativeFetch(
      currentUrl,
      method,
      headers,
      body,
      init.signal,
    );

    if (!REDIRECT_STATUSES.has(response.status)) return response;
    if (redirectCount >= MAX_REDIRECTS) {
      await response.body?.cancel();
      throw new Error("Too many HTTP redirects");
    }

    const location = response.headers.get("location");
    if (!location) return response;
    const nextUrl = resolveSafeRedirect(currentUrl, location, allowedOrigin);
    await response.body?.cancel();

    if (
      response.status === 303 ||
      ((response.status === 301 || response.status === 302) && method === "POST")
    ) {
      method = "GET";
      body = undefined;
      headers = new Headers(headers);
      headers.delete("content-type");
      headers.delete("content-length");
    }
    currentUrl = nextUrl;
  }
}
