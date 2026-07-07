import { load } from "@tauri-apps/plugin-store";

const STORE_PATH = "settings.json";
const PAUSE_KEY = "pausedTimers";
const LEGACY_PAUSE_KEY = "pausedTimer";
const MAX_PAUSED_TIMERS = 10;

export interface PausedTimerData {
  id: string;
  /** Id of the connection this paused timer belongs to (so timers aren't
   *  shared between two connections pointing at the same server). */
  connectionId: string;
  lastTimesheetId?: number;
  projectId: number;
  activityId: number;
  project: string;
  projectColor: string;
  activityColor: string;
  customerColor: string;
  activity: string;
  description: string;
  tags: string[];
  pausedAt: string;
}

let storePromise: ReturnType<typeof load> | null = null;

function getStore() {
  if (!storePromise) {
    storePromise = load(STORE_PATH, { defaults: {}, autoSave: true });
  }
  return storePromise;
}

export async function loadPausedTimers(): Promise<PausedTimerData[]> {
  try {
    const store = await getStore();
    const arr = await store.get<PausedTimerData[]>(PAUSE_KEY);
    if (arr && arr.length > 0) return arr;

    // Migrate legacy single-timer key
    const legacy = await store.get<Omit<PausedTimerData, "id"> & { id?: string }>(LEGACY_PAUSE_KEY);
    if (legacy) {
      const migrated: PausedTimerData = { ...legacy, id: legacy.id ?? crypto.randomUUID() };
      await store.set(PAUSE_KEY, [migrated]);
      await store.delete(LEGACY_PAUSE_KEY);
      await store.save();
      return [migrated];
    }

    return [];
  } catch {
    return [];
  }
}

export async function addPausedTimer(data: PausedTimerData): Promise<PausedTimerData[]> {
  const store = await getStore();
  const current = (await store.get<PausedTimerData[]>(PAUSE_KEY)) ?? [];
  current.push(data);

  // Evict oldest if over limit
  if (current.length > MAX_PAUSED_TIMERS) {
    current.sort((a, b) => a.pausedAt.localeCompare(b.pausedAt));
    current.splice(0, current.length - MAX_PAUSED_TIMERS);
  }

  await store.set(PAUSE_KEY, current);
  await store.save();
  return current;
}

export async function removePausedTimer(id: string): Promise<PausedTimerData[]> {
  const store = await getStore();
  const current = (await store.get<PausedTimerData[]>(PAUSE_KEY)) ?? [];
  const updated = current.filter((t) => t.id !== id);
  await store.set(PAUSE_KEY, updated);
  await store.save();
  return updated;
}

export async function clearAllPausedTimers(): Promise<void> {
  const store = await getStore();
  await store.delete(PAUSE_KEY);
  await store.save();
}
