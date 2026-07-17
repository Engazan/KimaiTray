import { emitTo } from "@tauri-apps/api/event";
import { Window } from "@tauri-apps/api/window";
import type { ChangelogEntry } from "./changelog";

export const CHANGELOG_WINDOW_LABEL = "changelog";
export const CHANGELOG_SHOW_EVENT = "kimai://changelog-show";

export async function showChangelogWindow(
  changelog: ChangelogEntry,
): Promise<boolean> {
  const win = await Window.getByLabel(CHANGELOG_WINDOW_LABEL);
  if (!win) return false;
  await emitTo(CHANGELOG_WINDOW_LABEL, CHANGELOG_SHOW_EVENT, changelog);
  await win.show();
  await win.setFocus();
  return true;
}
