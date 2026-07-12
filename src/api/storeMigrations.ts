import { invoke } from "@tauri-apps/api/core";

type LegacyStoreMigration =
  | { type: "categoryConfig" }
  | { type: "categoryLastActivity" }
  | { type: "hiddenTasks"; connectionId: string }
  | { type: "pausedTimer"; generatedId: string }
  | { type: "settingsConnection"; generatedId: string; name: string };

export async function migrateLegacyStore<T>(
  migration: LegacyStoreMigration,
): Promise<T> {
  const response = await invoke<{ value: T }>("migrate_legacy_store", {
    request: { migration },
  });
  return response.value;
}
