import type {
  PluginSettings,
  TimesheetCustomFieldDefinition,
  TimesheetCustomFieldType,
} from "../types";
import { ISSUE_LINK_META_NAME } from "../api/timesheetMeta";

export const DESCRIPTION_INPUT_TARGET = "description";

export interface PluginCustomInputDefinition {
  /** Stable identifier persisted by integrations as an insertion target. */
  id: string;
  pluginKey?: keyof PluginSettings;
  metadataName: string;
  labelKey: string;
  placeholderKey: string;
  label?: string;
  placeholder?: string;
  type?: TimesheetCustomFieldType;
  required?: boolean;
}

export const CREATIVE_ISSUE_LINK_INPUT_ID =
  "plugin:creative-issue-link:issue-link";

const pluginCustomInputs: readonly PluginCustomInputDefinition[] = [
  {
    id: CREATIVE_ISSUE_LINK_INPUT_ID,
    pluginKey: "creativeIssueLink",
    metadataName: ISSUE_LINK_META_NAME,
    labelKey: "plugins.issueFieldLabel",
    placeholderKey: "plugins.issueFieldPlaceholder",
  },
];

export function getEnabledPluginCustomInputs(
  settings: PluginSettings,
  customFields: readonly TimesheetCustomFieldDefinition[] = [],
): PluginCustomInputDefinition[] {
  const inputs = pluginCustomInputs.filter(
    (input) => input.pluginKey !== undefined && settings[input.pluginKey],
  );
  const names = new Set(inputs.map((input) => input.metadataName));
  for (const field of customFields) {
    if (names.has(field.name)) continue;
    names.add(field.name);
    inputs.push({
      id: `custom-field:${field.name}`,
      metadataName: field.name,
      labelKey: "",
      placeholderKey: "",
      label: field.label.trim() || field.name,
      placeholder: field.type === "url" ? "https://…" : "",
      type: field.type,
      required: field.required,
    });
  }
  return inputs;
}

export function customInputLabel(
  input: PluginCustomInputDefinition,
  translate: (key: string) => string,
): string {
  return input.label ?? translate(input.labelKey);
}

export function customInputPlaceholder(
  input: PluginCustomInputDefinition,
  translate: (key: string) => string,
): string {
  return input.placeholder ?? translate(input.placeholderKey);
}

export function isValidCustomInputValue(
  input: PluginCustomInputDefinition,
  value: string,
): boolean {
  const trimmed = value.trim();
  if (!trimmed) return !input.required;
  if (input.type !== "url") return true;
  try {
    const url = new URL(trimmed);
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}

export function pickPluginMetadata(
  metadata: Record<string, string> | undefined,
  inputs: readonly PluginCustomInputDefinition[],
): Record<string, string> | undefined {
  if (!metadata) return undefined;
  const picked = Object.fromEntries(
    inputs.flatMap((input) => {
      const value = metadata[input.metadataName]?.trim();
      return value ? [[input.metadataName, value]] : [];
    }),
  );
  return Object.keys(picked).length > 0 ? picked : undefined;
}
