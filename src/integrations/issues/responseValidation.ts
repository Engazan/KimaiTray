export type UnknownRecord = Record<string, unknown>;

export function isRecord(value: unknown): value is UnknownRecord {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

export function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

export function expectArrayOf<T>(
  value: unknown,
  guard: (item: unknown) => item is T,
  context: string,
): T[] {
  if (!Array.isArray(value) || !value.every(guard)) {
    throw new Error(`${context} returned an invalid response`);
  }
  return value;
}

export function expectObject<T>(
  value: unknown,
  guard: (item: unknown) => item is T,
  context: string,
): T {
  if (!guard(value)) {
    throw new Error(`${context} returned an invalid response`);
  }
  return value;
}
