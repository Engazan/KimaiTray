import { safeHttpFetch as fetch } from "../api/safeHttp";
import type { CategoryConfig } from "./types";
import { normalizeCategories } from "./categoryNormalize";

export interface RemoteCategoryConfig {
  categories: CategoryConfig["categories"];
  continueWindowMinutes?: number;
}

/**
 * Fetch and validate a category config from a URL. Accepts either a raw
 * categories array or an object `{ categories: [...], continueWindowMinutes? }`.
 * Uses the bounded native HTTP broker (bypasses webview CORS). Returns null on any
 * network/parse/shape failure — the caller keeps its existing config.
 */
export async function fetchRemoteCategoryConfig(
  url: string,
  connectionId = "",
): Promise<RemoteCategoryConfig | null> {
  try {
    const res = await fetch(url, {
      authorization: connectionId
        ? { type: "category", connectionId }
        : { type: "test", origin: new URL(url).origin },
      method: "GET",
    });
    if (!res.ok) return null;
    const data: unknown = await res.json();
    const obj =
      data && typeof data === "object" && !Array.isArray(data)
        ? (data as Record<string, unknown>)
        : null;
    const rawCategories = Array.isArray(data) ? data : obj?.categories;
    if (!Array.isArray(rawCategories)) return null;
    const cwm = obj?.continueWindowMinutes;
    return {
      categories: normalizeCategories(rawCategories),
      continueWindowMinutes: typeof cwm === "number" ? cwm : undefined,
    };
  } catch {
    return null;
  }
}
