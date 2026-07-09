import type { ComponentType, ReactNode } from "react";
import type { AppSettings } from "../../types";
import IssueIntegrationDetail from "./IssueIntegrationDetail";

/** Props every integration detail (configuration) screen receives. */
export interface IntegrationDetailProps {
  settings: AppSettings;
  update: <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => void;
  /** Connection whose integration is being configured. */
  connectionId: string;
  onBack: () => void;
}

/**
 * A single available integration. Adding a new integration means appending an
 * entry here and providing a `detail` screen — the list UI and routing adapt
 * automatically.
 */
export interface IntegrationDefinition {
  /** Stable identifier used for routing between the list and its detail. */
  id: string;
  /** i18n key for the display name. */
  nameKey: string;
  /** i18n key for the short description shown in the list. */
  descriptionKey: string;
  /** Icon shown next to the name in the list. */
  icon: ReactNode;
  /** Whether this integration is currently enabled for the given connection. */
  isEnabled: (settings: AppSettings, connectionId: string) => boolean;
  /** Configuration screen opened when the list row is activated. */
  detail: ComponentType<IntegrationDetailProps>;
}

function GitIcon() {
  return (
    <svg
      className="h-5 w-5"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.7}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="18" cy="18" r="3" />
      <circle cx="6" cy="6" r="3" />
      <path d="M6 21V9a9 9 0 0 0 9 9" />
    </svg>
  );
}

export const INTEGRATIONS: IntegrationDefinition[] = [
  {
    id: "git",
    nameKey: "integrations.git.name",
    descriptionKey: "integrations.git.description",
    icon: <GitIcon />,
    isEnabled: (settings, connectionId) =>
      settings.issueIntegrations[connectionId]?.enabled ?? false,
    detail: IssueIntegrationDetail,
  },
];
