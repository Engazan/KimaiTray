/**
 * Recognizes a search query that names an issue by its number, e.g. "42" or
 * "#42". Returns the positive issue number, or null for any other query.
 */
export function parseIssueNumberQuery(query: string): number | null {
  const match = query.trim().match(/^#?\s*(\d{1,9})$/);
  if (!match) return null;
  const value = Number(match[1]);
  return value > 0 ? value : null;
}

/** Put the exact number match first and drop its duplicate from the list. */
export function prependExactIssue<T>(
  exact: T | null,
  list: T[],
  idOf: (item: T) => number,
  limit: number,
): T[] {
  if (!exact) return list.slice(0, limit);
  const exactId = idOf(exact);
  return [exact, ...list.filter((item) => idOf(item) !== exactId)].slice(0, limit);
}
