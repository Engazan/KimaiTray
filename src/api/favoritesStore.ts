import { load } from "@tauri-apps/plugin-store";
import { invoke } from "@tauri-apps/api/core";
import type { FavoriteTask } from "../types";
import { mutateArrayStore } from "./arrayStore";

const STORE_PATH = "settings.json";
const KEY = "favoriteTasks";

let storePromise: ReturnType<typeof load> | null = null;

function getStore() {
  if (!storePromise) {
    storePromise = load(STORE_PATH, { defaults: {}, autoSave: true });
  }
  return storePromise;
}

function belongsToConnection(
  task: FavoriteTask,
  connectionId: string,
  legacyBaseUrl?: string,
): boolean {
  if (task.connectionId) return task.connectionId === connectionId;
  return !!legacyBaseUrl && task.baseUrl === legacyBaseUrl;
}

export async function loadFavorites(
  connectionId: string,
  legacyBaseUrl?: string,
): Promise<FavoriteTask[]> {
  try {
    const store = await getStore();
    let all = (await store.get<FavoriteTask[]>(KEY)) ?? [];

    // The first active connection after upgrade claims matching legacy data.
    // From then on every item has an explicit connection identity, preventing
    // two accounts on the same Kimai URL from sharing favorites.
    if (
      legacyBaseUrl &&
      all.some(
        (t) =>
          !t.connectionId && (!t.baseUrl || t.baseUrl === legacyBaseUrl),
      )
    ) {
      const response = await invoke<{ value: FavoriteTask[] }>(
        "claim_legacy_favorites_store",
        { request: { connectionId, baseUrl: legacyBaseUrl } },
      );
      all = response.value;
    }

    return all.filter((t) => t.connectionId === connectionId);
  } catch {
    return [];
  }
}

export async function addFavorite(task: FavoriteTask): Promise<FavoriteTask[]> {
  const updated = await mutateArrayStore<FavoriteTask>(KEY, {
    type: "appendUnique",
    value: task,
    identity: { key: task.key, connectionId: task.connectionId },
  });
  return updated.filter((t) => t.connectionId === task.connectionId);
}

export async function removeFavorite(
  key: string,
  connectionId: string,
  legacyBaseUrl?: string,
): Promise<FavoriteTask[]> {
  // loadFavorites claims matching legacy entries before mutations reach here.
  await loadFavorites(connectionId, legacyBaseUrl);
  const updated = await mutateArrayStore<FavoriteTask>(KEY, {
    type: "removeMatching",
    identity: { key, connectionId },
  });
  return updated.filter((t) =>
    belongsToConnection(t, connectionId, legacyBaseUrl),
  );
}

/**
 * Move all favorites scoped to `fromBaseUrl` onto `toBaseUrl`.
 * Favorites already present on the destination (same key) are not duplicated.
 * Returns the number of favorites moved.
 */
export async function moveFavorites(
  fromConnectionId: string,
  toConnectionId: string,
  fromBaseUrl?: string,
  toBaseUrl?: string,
): Promise<number> {
  if (!fromConnectionId || !toConnectionId || fromConnectionId === toConnectionId) return 0;
  const response = await invoke<{ count: number }>("move_favorites_store", {
    request: {
      fromConnectionId,
      toConnectionId,
      fromBaseUrl,
      toBaseUrl,
    },
  });
  return response.count;
}
