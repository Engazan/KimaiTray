import { useEffect, useState } from "react";
import { getPlatformInfo, type PlatformInfo } from "../api/platform";

/**
 * Cached platform capabilities (OS + Wayland). Returns `null` until the first
 * backend query resolves, so callers should treat `null` as "unknown / assume
 * capable" and only degrade a control once the value is known.
 */
export function usePlatform(): PlatformInfo | null {
  const [platform, setPlatform] = useState<PlatformInfo | null>(null);

  useEffect(() => {
    let active = true;
    getPlatformInfo().then((info) => {
      if (active) setPlatform(info);
    });
    return () => {
      active = false;
    };
  }, []);

  return platform;
}
