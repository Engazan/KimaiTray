import { invoke } from "@tauri-apps/api/core";

type ArrayStoreMutation<T extends object> =
  | {
      type: "appendUnique";
      value: T;
      identity: Partial<T>;
      limit?: number;
      sortField?: keyof T & string;
    }
  | { type: "removeMatching"; identity: Partial<T> }
  | { type: "clear" };

export async function mutateArrayStore<T extends object>(
  key: string,
  mutation: ArrayStoreMutation<T>,
): Promise<T[]> {
  const response = await invoke<{ value: T[] }>("mutate_array_store", {
    request: { key, mutation },
  });
  return response.value;
}
