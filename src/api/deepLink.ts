import { getCurrent, onOpenUrl } from "@tauri-apps/plugin-deep-link";
import { logger } from "../utils/logger";

type DeepLinkSubscriber = (url: string) => void;

const subscribers = new Set<DeepLinkSubscriber>();
const queuedUrls: string[] = [];
let initializePromise: Promise<void> | null = null;
const CONSUMED_CURRENT_URLS_STORAGE_KEY = "kimaitray:deep-link:consumed-current-urls";
const MACOS_CURRENT_URL_RETRY_INTERVAL_MS = 50;
const MACOS_CURRENT_URL_RETRY_ATTEMPTS = 30;

function isMacOsWebView(): boolean {
  return typeof navigator !== "undefined" && /Macintosh|Mac OS X/.test(navigator.userAgent);
}

function consumedCurrentUrls(): string | null {
  if (typeof sessionStorage === "undefined") return null;
  return sessionStorage.getItem(CONSUMED_CURRENT_URLS_STORAGE_KEY);
}

function rememberCurrentUrls(urls: string[]): void {
  if (typeof sessionStorage === "undefined") return;
  sessionStorage.setItem(CONSUMED_CURRENT_URLS_STORAGE_KEY, JSON.stringify(urls));
}

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
    rememberCurrentUrls(urls);
    publish(urls);
  });
  let current = await getCurrent();
  const currentWasAvailableBeforeRetry = current !== null;
  if (!current) {
    // On macOS the native plugin emits its event just before it stores the
    // matching current URL. If that event lands immediately before the JS
    // listener is registered, one later task gives the store time to settle.
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
    current = await getCurrent();
  }
  if (!current && isMacOsWebView()) {
    // A cold macOS protocol launch can create the webview before
    // LaunchServices has delivered the URL to the native plugin. The live
    // event is then too early for the React listener, while a single task-tick
    // retry is still too early for getCurrent. Poll briefly during startup so
    // the initial URL is claimed once the plugin's current value catches up.
    for (
      let attempt = 0;
      attempt < MACOS_CURRENT_URL_RETRY_ATTEMPTS && !current;
      attempt += 1
    ) {
      await new Promise<void>((resolve) =>
        setTimeout(resolve, MACOS_CURRENT_URL_RETRY_INTERVAL_MS),
      );
      current = await getCurrent();
    }
  }
  if (current) {
    const currentFingerprint = JSON.stringify(current);
    const wasCurrentAlreadyConsumed = currentWasAvailableBeforeRetry
      && consumedCurrentUrls() === currentFingerprint;
    rememberCurrentUrls(current);
    if (!wasCurrentAlreadyConsumed) {
      publish(current.filter((url) => !liveUrls.has(url)));
    }
  }
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
