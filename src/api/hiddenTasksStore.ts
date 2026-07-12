import { load } from "@tauri-apps/plugin-store";
import { mutateScopedStore } from "./scopedStore";

const STORE_PATH = "settings.json";
const KEY = "hiddenRecentTasks";
const SCOPED_KEY = "hiddenRecentTasksByConnection";

let storePromise: ReturnType<typeof load> | null = null;

function getStore() {
  if (!storePromise) {
    storePromise = load(STORE_PATH, { defaults: {}, autoSave: true });
  }
  return storePromise;
}

async function loadScopedTasks(connectionId: string): Promise<{
  store: Awaited<ReturnType<typeof getStore>>;
  all: Record<string, string[]>;
  current: string[];
}> {
  const store = await getStore();
  const all =
    (await store.get<Record<string, string[]>>(SCOPED_KEY)) ?? {};
  if (Object.prototype.hasOwnProperty.call(all, connectionId)) {
    return { store, all, current: all[connectionId] ?? [] };
  }
  const legacy = (await store.get<string[]>(KEY)) ?? [];
  if (legacy.length > 0) {
    await mutateScopedStore(SCOPED_KEY, connectionId, {
      type: "set",
      value: legacy,
    });
    await store.delete(KEY);
    await store.save();
    return { store, all: { ...all, [connectionId]: legacy }, current: legacy };
  }
  return { store, all, current: [] };
}

export async function loadHiddenTasks(connectionId: string): Promise<string[]> {
  if (!connectionId) return [];
  try {
    const { current } = await loadScopedTasks(connectionId);
    return current;
  } catch {
    return [];
  }
}

export async function addHiddenTask(
  connectionId: string,
  key: string,
): Promise<string[]> {
  const { current } = await loadScopedTasks(connectionId);
  if (current.includes(key)) return current;
  return mutateScopedStore<string[]>(SCOPED_KEY, connectionId, {
    type: "addString",
    value: key,
  });
}

export async function removeHiddenTask(
  connectionId: string,
  key: string,
): Promise<string[]> {
  await loadScopedTasks(connectionId);
  return mutateScopedStore<string[]>(SCOPED_KEY, connectionId, {
    type: "removeString",
    value: key,
  });
}

export async function clearHiddenTasks(connectionId: string): Promise<void> {
  await loadScopedTasks(connectionId);
  await mutateScopedStore<string[]>(SCOPED_KEY, connectionId, {
    type: "clearStrings",
  });
}
