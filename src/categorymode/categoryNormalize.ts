import type { CategoryConfig } from "./types";

const genId = () => crypto.randomUUID();

/** Sanitize an untrusted categories array (from JSON import or a remote URL) so
 *  the panel never renders a category without a `children` array or a leaf
 *  without an id. Bad entries are dropped; missing fields get safe defaults. */
export function normalizeCategories(raw: unknown): CategoryConfig["categories"] {
  if (!Array.isArray(raw)) return [];
  const out: CategoryConfig["categories"] = [];
  for (const c of raw) {
    if (!c || typeof c !== "object") continue;
    const cat = c as Record<string, unknown>;
    const children: CategoryConfig["categories"][number]["children"] = [];
    for (const l of Array.isArray(cat.children) ? cat.children : []) {
      if (!l || typeof l !== "object") continue;
      const leaf = l as Record<string, unknown>;
      children.push({
        id: typeof leaf.id === "string" && leaf.id ? leaf.id : genId(),
        label: typeof leaf.label === "string" ? leaf.label : "",
        activityName: typeof leaf.activityName === "string" ? leaf.activityName : "",
        tags: Array.isArray(leaf.tags)
          ? leaf.tags.filter((tg): tg is string => typeof tg === "string")
          : undefined,
        requiresProject: leaf.requiresProject === true,
      });
    }
    out.push({
      id: typeof cat.id === "string" && cat.id ? cat.id : genId(),
      label: typeof cat.label === "string" ? cat.label : "",
      children,
    });
  }
  return out;
}
