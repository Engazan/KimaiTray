export function normalizeCustomStartTime(
  value: string,
  nowMs = Date.now(),
): string | null {
  if (!value) return null;
  const parsed = new Date(value);
  const timestamp = parsed.getTime();
  if (!Number.isFinite(timestamp) || timestamp > nowMs) return null;
  return parsed.toISOString();
}
