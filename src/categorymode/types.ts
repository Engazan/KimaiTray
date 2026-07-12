// Data model for Category Mode — a per-connection, user-configurable tree of work
// categories mapped onto Kimai activities. Kept entirely separate from the core
// timer engine: a leaf only produces a project+activity that feeds the existing
// `useStartTask` start path.
import type { CategoryColor, CategoryIcon } from "./CategoryVisual";

export interface CategoryLeaf {
  /** Stable identifier used for React keys and per-item spinner tracking. */
  id: string;
  /** Human-readable button label (config data, editable by the team lead). */
  label: string;
  /** Name of the Kimai activity this leaf maps to. Matched by name so it
   *  survives activity-id changes (see useCategoryActivityMapping). */
  activityName: string;
  /** Optional tags applied to the timesheet when starting. */
  tags?: string[];
  /** Customer-facing categories require picking a real client project before
   *  starting. Categories that don't require one use CategoryConfig.defaultProjectId. */
  requiresProject: boolean;
}

export interface Category {
  id: string;
  label: string;
  /** Optional visual identity used by the category button and drill-down header. */
  icon?: CategoryIcon;
  color?: CategoryColor;
  children: CategoryLeaf[];
}

export interface CategoryConfig {
  /** Ordered list of top-level categories, each with its leaf subcategories. */
  categories: Category[];
  /** Default project used for leaves that don't require a client project.
   *  `null` until the team lead picks one in the settings editor — such leaves
   *  stay disabled until then. */
  defaultProjectId: number | null;
  /** Minutes after a category timer stops during which the "continue last
   *  activity" shortcut stays offered (FR6). */
  continueWindowMinutes: number;
  /** Optional URL to fetch the category tree from; refreshed hourly. When set,
   *  `categories` is managed remotely and local edits are overwritten on sync. */
  sourceUrl?: string;
  /** Epoch seconds of the last successful remote sync. */
  sourceSyncedAt?: number;
}

/** Snapshot persisted after each CS start, for the "continue last activity"
 *  shortcut. Mirrors the fields needed to rebuild a StartTaskPayload. */
export interface CategoryLastActivity {
  leafId: string;
  label: string;
  projectId: number;
  activityId: number;
  tags?: string[];
  /** Epoch seconds when this activity was started. */
  startedAt: number;
  /** Epoch seconds when this activity was last stopped; undefined while it is
   *  running. The "continue" window (FR6) is measured from this. */
  stoppedAt?: number;
}
