import type { PluginSettings } from "../types";
import { ISSUE_LINK_META_NAME } from "../api/timesheetMeta";

export const DESCRIPTION_INPUT_TARGET = "description";

export interface PluginCustomInputDefinition {
  /** Stable identifier persisted by integrations as an insertion target. */
  id: string;
  pluginKey: keyof PluginSettings;
  metadataName: string;
  labelKey: string;
  placeholderKey: string;
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
): PluginCustomInputDefinition[] {
  return pluginCustomInputs.filter((input) => settings[input.pluginKey]);
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
