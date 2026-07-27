import type { KimaiTimesheetEntry } from "./kimaiTypes";

export const ISSUE_LINK_META_NAME = "issue_link";

export function getStringTimesheetMetadata(
  timesheet: Pick<KimaiTimesheetEntry, "metaFields">,
): Record<string, string> | undefined {
  const metadata = Object.fromEntries(
    (timesheet.metaFields ?? []).flatMap((field) => {
      const value =
        typeof field.value === "string" ? field.value.trim() : "";
      return field.name && value ? [[field.name, value]] : [];
    }),
  );
  return Object.keys(metadata).length > 0 ? metadata : undefined;
}

export function getIssueLinkMeta(
  timesheet: Pick<KimaiTimesheetEntry, "metaFields">,
): string | undefined {
  return getStringTimesheetMetadata(timesheet)?.[ISSUE_LINK_META_NAME];
}
