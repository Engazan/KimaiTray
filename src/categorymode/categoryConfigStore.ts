import { load } from "@tauri-apps/plugin-store";
import type { CategoryConfig } from "./types";
import { cloneDefaultCategoryConfig } from "./defaultCategoryConfig";

// Persists the Category Mode category tree per connection, as a sibling key inside the
// shared settings.json plugin-store (same idiom as favoritesStore/hiddenTasksStore).
const STORE_PATH = "settings.json";
const KEY = "categoryConfig";
// Legacy key from before the "CS Mode" → "Category Mode" rename.
const LEGACY_KEY = "csConfig";

type CategoryConfigMap = Record<string, CategoryConfig>;

/** Merge a stored config over the defaults, mapping the legacy
 *  `internalProjectId` field onto `defaultProjectId` for backward compatibility. */
function withDefaults(cfg: CategoryConfig | undefined): CategoryConfig {
  const merged = { ...cloneDefaultCategoryConfig(), ...(cfg ?? {}) };
  const legacy = (cfg as { internalProjectId?: number | null } | undefined)
    ?.internalProjectId;
  if (merged.defaultProjectId == null && legacy != null) {
    merged.defaultProjectId = legacy;
  }
  delete (merged as { internalProjectId?: unknown }).internalProjectId;
  return merged;
}

let storePromise: ReturnType<typeof load> | null = null;

function getStore() {
  if (!storePromise) {
    storePromise = load(STORE_PATH, { defaults: {}, autoSave: true });
  }
  return storePromise;
}

type Store = Awaited<ReturnType<typeof getStore>>;

/** Return the config map, migrating the whole legacy-key map to the new key
 *  once (so reads and writes never diverge across the two keys). */
async function readMap(store: Store): Promise<CategoryConfigMap> {
  const existing = await store.get<CategoryConfigMap>(KEY);
  if (existing !== undefined) return existing;
  const legacy = await store.get<CategoryConfigMap>(LEGACY_KEY);
  if (legacy !== undefined) {
    await store.set(KEY, legacy);
    await store.delete(LEGACY_KEY);
    await store.save();
    return legacy;
  }
  return {};
}

/** Load the config for a connection, falling back to a fresh default clone when
 *  nothing is stored (or the connection is not yet saved). */
export async function loadCategoryConfig(connectionId: string): Promise<CategoryConfig> {
  if (!connectionId) return cloneDefaultCategoryConfig();
  try {
    const store = await getStore();
    const all = await readMap(store);
    const cfg = all[connectionId];
    return cfg ? withDefaults(cfg) : cloneDefaultCategoryConfig();
  } catch {
    return cloneDefaultCategoryConfig();
  }
}

export async function saveCategoryConfig(
  connectionId: string,
  config: CategoryConfig,
): Promise<void> {
  if (!connectionId) return;
  const store = await getStore();
  const all = await readMap(store);
  all[connectionId] = config;
  await store.set(KEY, all);
  await store.save();
}

/** Subscribe to cross-window config changes so the popup reflects edits made in
 *  the settings window immediately (mirrors service.onSettingsChange). */
export async function onCategoryConfigChange(
  connectionId: string,
  cb: (config: CategoryConfig) => void,
): Promise<() => void> {
  const store = await getStore();
  const unlisten = await store.onKeyChange<CategoryConfigMap>(KEY, (map) => {
    const cfg = map?.[connectionId];
    cb(cfg ? withDefaults(cfg) : cloneDefaultCategoryConfig());
  });
  return unlisten;
}
