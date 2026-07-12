import { load } from "@tauri-apps/plugin-store";
import type { CategoryLastActivity } from "./types";
import { mutateScopedStore } from "../api/scopedStore";

// Remembers the last category activity started per connection, for the
// "continue last activity" shortcut (FR6). Sibling key in settings.json.
const STORE_PATH = "settings.json";
const KEY = "categoryLastActivity";
// Legacy key from before the "CS Mode" → "Category Mode" rename.
const LEGACY_KEY = "csLastActivity";

type CategoryLastActivityMap = Record<string, CategoryLastActivity>;

let storePromise: ReturnType<typeof load> | null = null;

function getStore() {
  if (!storePromise) {
    storePromise = load(STORE_PATH, { defaults: {}, autoSave: true });
  }
  return storePromise;
}

type Store = Awaited<ReturnType<typeof getStore>>;

/** Return the map, migrating the whole legacy-key map to the new key once
 *  (so reads and writes never diverge across the two keys). */
async function readMap(store: Store): Promise<CategoryLastActivityMap> {
  const existing = await store.get<CategoryLastActivityMap>(KEY);
  if (existing !== undefined) return existing;
  const legacy = await store.get<CategoryLastActivityMap>(LEGACY_KEY);
  if (legacy !== undefined) {
    await store.set(KEY, legacy);
    await store.delete(LEGACY_KEY);
    await store.save();
    return legacy;
  }
  return {};
}

export async function loadCategoryLastActivity(
  connectionId: string,
): Promise<CategoryLastActivity | null> {
  if (!connectionId) return null;
  try {
    const store = await getStore();
    const all = await readMap(store);
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
