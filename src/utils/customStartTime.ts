import { toKimaiLocal } from "./time";

export function normalizeCustomStartTime(
  value: string,
  nowMs = Date.now(),
): string | null {
  if (!value) return null;
  const parsed = new Date(value);
  const timestamp = parsed.getTime();
  if (!Number.isFinite(timestamp) || timestamp > nowMs) return null;
  // Kimai stamps the supplied wall-clock digits with the user's timezone and
  // ignores any offset, so send local wall-clock (not UTC) or the record lands
  // off by the user's UTC offset.
  return toKimaiLocal(parsed);
}
