import { getCurrent, onOpenUrl } from "@tauri-apps/plugin-deep-link";
import { logger } from "../utils/logger";

type DeepLinkSubscriber = (url: string) => void;

const subscribers = new Set<DeepLinkSubscriber>();
const queuedUrls: string[] = [];
let initializePromise: Promise<void> | null = null;

function publish(urls: string[]): void {
  for (const url of urls) {
    if (subscribers.size === 0) {
      queuedUrls.push(url);
      continue;
    }
    for (const subscriber of subscribers) subscriber(url);
  }
}

async function initialize(): Promise<void> {
  // Install the live listener first. getCurrent is updated for every event, so
  // suppress URLs already observed during this tiny initialization window.
  const liveUrls = new Set<string>();
  await onOpenUrl((urls) => {
    for (const url of urls) liveUrls.add(url);
    publish(urls);
  });
  const current = await getCurrent();
  if (current) publish(current.filter((url) => !liveUrls.has(url)));
}

/**
 * Subscribe once at the application level, while still surviving React
 * StrictMode's development mount/unmount cycle. Live listeners intentionally
 * remain installed for the lifetime of the tray webview.
 */
export function subscribeToDeepLinks(subscriber: DeepLinkSubscriber): () => void {
  subscribers.add(subscriber);
  while (queuedUrls.length > 0) subscriber(queuedUrls.shift()!);

  initializePromise ??= initialize().catch((error) => {
    initializePromise = null;
    logger.error(`Failed to initialize deep links: ${String(error)}`);
  });

  return () => {
    subscribers.delete(subscriber);
  };
}
