import type { ColorMode } from "../types";

interface ColoredEntity {
  color: string | null;
  "color-safe"?: string;
}

/**
 * Picks the colors used for a task's dots. Explicitly configured Kimai colors
 * win so the activity → project → customer cascade keeps its meaning; only when
 * none is set do we fall back to Kimai's effective `color-safe` values, which
 * the new-timer pickers already show.
 */
export function resolveEntityColors(
  project: ColoredEntity | undefined,
  activity: ColoredEntity | undefined,
  customer: ColoredEntity | undefined,
): { projectColor: string; activityColor: string; customerColor: string } {
  const hasExplicit = !!(project?.color || activity?.color || customer?.color);
  const pick = (entity: ColoredEntity | undefined) =>
    (hasExplicit ? entity?.color : entity?.color || entity?.["color-safe"]) || "";
  return {
    projectColor: pick(project),
    activityColor: pick(activity),
    customerColor: pick(customer),
  };
}

const FALLBACK = "#6b7280";

export function resolveDisplayColors(
  activityColor: string,
  projectColor: string,
  customerColor: string,
  mode: ColorMode,
): string[] {
  switch (mode) {
    case "activity":
      return [activityColor || FALLBACK];
    case "project":
      return [projectColor || FALLBACK];
    case "customer":
      return [customerColor || FALLBACK];
    case "activity-project":
      return [activityColor || FALLBACK, projectColor || FALLBACK];
    case "activity-customer":
      return [activityColor || FALLBACK, customerColor || FALLBACK];
    case "project-customer":
      return [projectColor || FALLBACK, customerColor || FALLBACK];
    case "kimai":
    default:
      return [activityColor || projectColor || customerColor || FALLBACK];
  }
}
