const COMBINING_MARKS = /\p{M}+/gu;

/** Builds a case-insensitive key while preserving meaningful diacritics. */
export function normalizeTextKey(value: string): string {
  return value.toLowerCase().normalize("NFC");
}

/**
 * Builds a case- and diacritic-insensitive key for user-facing search.
 * NFD makes canonically equivalent input comparable regardless of whether the
 * platform emits one precomposed code point or a base character plus marks.
 */
export function normalizeSearchText(value: string): string {
  return value.normalize("NFD").replace(COMBINING_MARKS, "").toLowerCase();
}
