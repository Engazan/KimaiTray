import { useSyncExternalStore } from "react";

const QUERY = "(prefers-color-scheme: dark)";

function subscribe(onChange: () => void): () => void {
  const mq = window.matchMedia?.(QUERY);
  mq?.addEventListener?.("change", onChange);
  return () => mq?.removeEventListener?.("change", onChange);
}

const getSnapshot = () => window.matchMedia?.(QUERY).matches ?? false;

/** Whether the operating system currently prefers a dark appearance. */
export function usePrefersDark(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot);
}
