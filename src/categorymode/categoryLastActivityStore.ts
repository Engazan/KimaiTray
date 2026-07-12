import type { CategoryLastActivity } from "./types";
import { mutateScopedStore } from "../api/scopedStore";
import { migrateLegacyStore } from "../api/storeMigrations";

// Remembers the last category activity started per connection, for the
// "continue last activity" shortcut (FR6). Sibling key in settings.json.
const KEY = "categoryLastActivity";

type CategoryLastActivityMap = Record<string, CategoryLastActivity>;

/** Return the map, migrating the whole legacy-key map to the new key once
 *  (so reads and writes never diverge across the two keys). */
async function readMap(): Promise<CategoryLastActivityMap> {
  return migrateLegacyStore<CategoryLastActivityMap>({
    type: "categoryLastActivity",
  });
}

export async function loadCategoryLastActivity(
  connectionId: string,
): Promise<CategoryLastActivity | null> {
  if (!connectionId) return null;
  try {
    const all = await readMap();
    return all[connectionId] ?? null;
  } catch {
    return null;
  }
}

export async function saveCategoryLastActivity(
  connectionId: string,
  data: CategoryLastActivity,
): Promise<void> {
  if (!connectionId) return;
  await mutateScopedStore(KEY, connectionId, { type: "set", value: data });
}
