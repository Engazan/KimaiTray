/**
 * Stable identity for a reusable task variant.
 *
 * A Kimai task is not fully identified by project and activity when its note
 * differs: restarting either recent item must restore the matching note. Keep
 * the legacy project-activity key for empty notes so existing saved state
 * remains compatible.
 */
export function taskKeyOf(
  projectId: number,
  activityId: number,
  description = "",
): string {
  const baseKey = `${projectId}-${activityId}`;
  return description ? `${baseKey}:${encodeURIComponent(description)}` : baseKey;
}
