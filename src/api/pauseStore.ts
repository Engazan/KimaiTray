import { load } from "@tauri-apps/plugin-store";
import { mutateArrayStore } from "./arrayStore";

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
const pendingRemovalIds = new Set<string>();
const pendingRemovalRetries = new Set<string>();

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
    if (arr) {
      return visiblePausedTimers(arr);
    }

    // Migrate legacy single-timer key
    const legacy = await store.get<Omit<PausedTimerData, "id"> & { id?: string }>(LEGACY_PAUSE_KEY);
    if (legacy) {
      const migrated: PausedTimerData = { ...legacy, id: legacy.id ?? crypto.randomUUID() };
      await store.set(PAUSE_KEY, [migrated]);
      await store.delete(LEGACY_PAUSE_KEY);
      await store.save();
      return visiblePausedTimers([migrated]);
    }

    retryPendingRemovals();
    return [];
  } catch {
    return [];
  }
}

export async function addPausedTimer(data: PausedTimerData): Promise<PausedTimerData[]> {
  return mutateArrayStore<PausedTimerData>(PAUSE_KEY, {
    type: "appendUnique",
    value: data,
    identity: { id: data.id },
    limit: MAX_PAUSED_TIMERS,
    sortField: "pausedAt",
  });
}

export async function removePausedTimer(id: string): Promise<PausedTimerData[]> {
  return mutateArrayStore<PausedTimerData>(PAUSE_KEY, {
    type: "removeMatching",
    identity: { id },
  });
}

function retryPendingRemovals(): void {
  for (const id of pendingRemovalIds) {
    if (pendingRemovalRetries.has(id)) continue;
    pendingRemovalRetries.add(id);
    void removePausedTimer(id)
      .then(() => pendingRemovalIds.delete(id))
      .catch(() => undefined)
      .finally(() => pendingRemovalRetries.delete(id));
  }
}

function visiblePausedTimers(timers: PausedTimerData[]): PausedTimerData[] {
  retryPendingRemovals();
  return timers.filter((timer) => !pendingRemovalIds.has(timer.id));
}

export async function removeResumedTimer(
  id: string,
): Promise<PausedTimerData[]> {
  pendingRemovalIds.add(id);
  try {
    const updated = await removePausedTimer(id);
    pendingRemovalIds.delete(id);
    return updated;
  } catch {
    const visible = await loadPausedTimers();
    return visible.filter((timer) => timer.id !== id);
  }
}

export async function clearAllPausedTimers(): Promise<void> {
  await mutateArrayStore<PausedTimerData>(PAUSE_KEY, { type: "clear" });
}
