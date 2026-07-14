import { invoke } from "@tauri-apps/api/core";
import { useEffect, useState } from "react";

export interface PlatformInfo {
  os: "macos" | "windows" | "linux" | "unknown";
  session: "native" | "wayland" | "x11" | "unknown";
  trayBackend: "native" | "legacy-gtk" | "appindicator";
  supportsTrayClickActions: boolean;
  supportsNativePopupCorners: boolean;
}

const fallbackPlatform: PlatformInfo = {
  os: "unknown",
  session: "unknown",
  trayBackend: "native",
  supportsTrayClickActions: false,
  supportsNativePopupCorners: false,
};

let cachedPlatform: PlatformInfo | null = null;
let platformRequest: Promise<PlatformInfo> | null = null;

export function getPlatformInfo(): Promise<PlatformInfo> {
  if (cachedPlatform) return Promise.resolve(cachedPlatform);
  if (!platformRequest) {
    platformRequest = invoke<PlatformInfo>("get_platform_info")
      .then((platform) => {
        cachedPlatform = platform;
        return platform;
      })
      .catch(() => {
        cachedPlatform = fallbackPlatform;
        return fallbackPlatform;
      });
  }
  return platformRequest;
}

export function currentPlatform(): PlatformInfo {
  return cachedPlatform ?? fallbackPlatform;
}

export function usePlatform(): PlatformInfo {
  const [platform, setPlatform] = useState(currentPlatform);
  useEffect(() => {
    void getPlatformInfo().then(setPlatform);
  }, []);
  return platform;
}
