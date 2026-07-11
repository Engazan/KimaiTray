import { load } from "@tauri-apps/plugin-store";
import type { FavoriteTask } from "../types";

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
      all = all.map((t) =>
        !t.connectionId && (!t.baseUrl || t.baseUrl === legacyBaseUrl)
          ? { ...t, connectionId, baseUrl: legacyBaseUrl }
          : t,
      );
      await store.set(KEY, all);
      await store.save();
    }

    return all.filter((t) => t.connectionId === connectionId);
  } catch {
    return [];
  }
}

export async function addFavorite(task: FavoriteTask): Promise<FavoriteTask[]> {
  const store = await getStore();
  const current = (await store.get<FavoriteTask[]>(KEY)) ?? [];
  if (
    current.some(
      (t) => t.key === task.key && t.connectionId === task.connectionId,
    )
  ) {
    return current.filter((t) => t.connectionId === task.connectionId);
  }
  const updated = [...current, task];
  await store.set(KEY, updated);
  await store.save();
  return updated.filter((t) => t.connectionId === task.connectionId);
}

export async function removeFavorite(
  key: string,
  connectionId: string,
  legacyBaseUrl?: string,
): Promise<FavoriteTask[]> {
  const store = await getStore();
  const current = (await store.get<FavoriteTask[]>(KEY)) ?? [];
  const updated = current.filter(
    (t) =>
      !(
        t.key === key &&
        belongsToConnection(t, connectionId, legacyBaseUrl)
      ),
  );
  await store.set(KEY, updated);
  await store.save();
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
  const store = await getStore();
  const all = (await store.get<FavoriteTask[]>(KEY)) ?? [];
  const moving = all.filter((t) =>
    belongsToConnection(t, fromConnectionId, fromBaseUrl),
  );
  if (moving.length === 0) return 0;

  const destKeys = new Set(
    all
      .filter((t) => belongsToConnection(t, toConnectionId, toBaseUrl))
      .map((t) => t.key),
  );
  const updated = all
    // Drop source favorites whose key already exists on the destination.
    .filter(
      (t) =>
        !(
          belongsToConnection(t, fromConnectionId, fromBaseUrl) &&
          destKeys.has(t.key)
        ),
    )
    // Re-scope the rest onto the destination connection.
    .map((t) =>
      belongsToConnection(t, fromConnectionId, fromBaseUrl)
        ? { ...t, connectionId: toConnectionId, baseUrl: toBaseUrl }
        : t,
    );

  await store.set(KEY, updated);
  await store.save();
  return moving.length;
}
