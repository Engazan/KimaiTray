import { invoke } from "@tauri-apps/api/core";

type ScopedStoreMutation<T> =
  | { type: "set"; value: T }
  | { type: "addString"; value: string }
  | { type: "removeString"; value: string }
  | { type: "clearStrings" };

export async function mutateScopedStore<T>(
  key: string,
  entryKey: string,
  mutation: ScopedStoreMutation<T>,
): Promise<T> {
  const response = await invoke<{ value: T }>("mutate_scoped_store", {
    request: { key, entryKey, mutation },
  });
  return response.value;
}
