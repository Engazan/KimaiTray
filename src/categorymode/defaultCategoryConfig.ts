import type { CategoryConfig } from "./types";

// Empty starting config — every user builds their own category tree in the
// settings editor (Settings → Category Mode). Categories map to Kimai activities by
// name; labels are plain data so they stay editable.
const DEFAULT_CATEGORY_CONFIG: CategoryConfig = {
  defaultProjectId: null,
  continueWindowMinutes: 15,
  categories: [],
};

/** Deep copy of the default config. Always clone before handing it to state so
 *  callers never mutate the shared template. */
export function cloneDefaultCategoryConfig(): CategoryConfig {
  return JSON.parse(JSON.stringify(DEFAULT_CATEGORY_CONFIG)) as CategoryConfig;
}
