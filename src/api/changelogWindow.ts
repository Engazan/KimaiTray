import { emitTo } from "@tauri-apps/api/event";
import { WebviewWindow } from "@tauri-apps/api/webviewWindow";
import {
  queueChangelogWindow,
  type ChangelogEntry,
} from "./changelog";
import { logger } from "../utils/logger";

export const CHANGELOG_WINDOW_LABEL = "changelog";
export const CHANGELOG_SHOW_EVENT = "kimai://changelog-show";

let windowOperation: Promise<void> = Promise.resolve();

async function showChangelogWindowNow(
  changelog: ChangelogEntry,
): Promise<boolean> {
  // This covers the startup race before the hidden window installs its event
  // listener; normal subsequent opens are delivered by the event below.
  queueChangelogWindow(changelog);
  const existing = await WebviewWindow.getByLabel(CHANGELOG_WINDOW_LABEL);
  if (!existing) {
    logger.error("Configured changelog window is unavailable");
    return false;
  }
  await existing.show();
  await existing.setFocus();
  await emitTo(CHANGELOG_WINDOW_LABEL, CHANGELOG_SHOW_EVENT, changelog);
  return true;
}

/** Serialize requests so the changelog window consumes staged content in order. */
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
