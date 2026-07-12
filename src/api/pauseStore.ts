import { mutateArrayStore } from "./arrayStore";
import { migrateLegacyStore } from "./storeMigrations";

const PAUSE_KEY = "pausedTimers";
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

const pendingRemovalIds = new Set<string>();
const pendingRemovalRetries = new Set<string>();

export async function loadPausedTimers(): Promise<PausedTimerData[]> {
  try {
    const timers = await migrateLegacyStore<PausedTimerData[]>({
      type: "pausedTimer",
      generatedId: crypto.randomUUID(),
    });
    return visiblePausedTimers(timers);
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
