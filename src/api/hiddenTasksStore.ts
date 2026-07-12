import { mutateScopedStore } from "./scopedStore";
import { migrateLegacyStore } from "./storeMigrations";

const SCOPED_KEY = "hiddenRecentTasksByConnection";

async function loadScopedTasks(connectionId: string): Promise<string[]> {
  return migrateLegacyStore<string[]>({
    type: "hiddenTasks",
    connectionId,
  });
}

export async function loadHiddenTasks(connectionId: string): Promise<string[]> {
  if (!connectionId) return [];
  try {
    return await loadScopedTasks(connectionId);
  } catch {
    return [];
  }
}

export async function addHiddenTask(
  connectionId: string,
  key: string,
): Promise<string[]> {
  const current = await loadScopedTasks(connectionId);
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
