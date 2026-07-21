import { emitTo } from "@tauri-apps/api/event";
import { WebviewWindow } from "@tauri-apps/api/webviewWindow";
import {
  queueChangelogWindow,
  type ChangelogEntry,
} from "./changelog";

export const CHANGELOG_WINDOW_LABEL = "changelog";
export const CHANGELOG_SHOW_EVENT = "kimai://changelog-show";

let windowOperation: Promise<void> = Promise.resolve();

function createChangelogWindow(): Promise<void> {
  const win = new WebviewWindow(CHANGELOG_WINDOW_LABEL, {
    title: "KimaiTray — What's New",
    url: "/",
    width: 620,
    height: 640,
    minWidth: 480,
    minHeight: 420,
    visible: false,
    center: true,
    resizable: true,
  });

  return new Promise((resolve, reject) => {
    void win.once("tauri://created", () => resolve());
    void win.once<unknown>("tauri://error", (event) => reject(event.payload));
  });
}

async function showChangelogWindowNow(
  changelog: ChangelogEntry,
): Promise<boolean> {
  const staged = queueChangelogWindow(changelog);
  const existing = await WebviewWindow.getByLabel(CHANGELOG_WINDOW_LABEL);
  if (existing) {
    await emitTo(CHANGELOG_WINDOW_LABEL, CHANGELOG_SHOW_EVENT, changelog);
    return true;
  }

  if (!staged) return false;
  await createChangelogWindow();
  return true;
}

/** Serialize requests so a newly created webview consumes its queued content first. */
export function showChangelogWindow(
  changelog: ChangelogEntry,
): Promise<boolean> {
  const operation = windowOperation.then(() => showChangelogWindowNow(changelog));
  windowOperation = operation.then(
    () => undefined,
    () => undefined,
  );
  return operation;
}
