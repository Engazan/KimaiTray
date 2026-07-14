import { invoke } from "@tauri-apps/api/core";

export type OsName = "macos" | "windows" | "linux" | "unknown";

export interface PlatformInfo {
  os: OsName;
  /** True only on a Linux Wayland session. Always false on macOS/Windows. */
  wayland: boolean;
}

const FALLBACK: PlatformInfo = { os: "unknown", wayland: false };

let cached: PlatformInfo | null = null;
let inflight: Promise<PlatformInfo> | null = null;

/**
 * Query OS / Wayland capabilities from the Rust backend. The platform never
 * changes at runtime, so the result is cached after the first successful call.
 */
export async function getPlatformInfo(): Promise<PlatformInfo> {
  if (cached) return cached;
  if (!inflight) {
    inflight = invoke<PlatformInfo>("get_platform_info")
      .then((info) => {
        cached = info;
        return info;
      })
      .catch(() => {
        cached = FALLBACK;
        return FALLBACK;
      })
      .finally(() => {
        inflight = null;
      });
  }
  return inflight;
}
