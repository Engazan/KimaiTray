import type { IssueIntegrationSettings } from "./integrations/issues/types";

export type { IssueIntegrationSettings };

export type ColorMode =
  | "kimai"
  | "activity"
  | "project"
  | "customer"
  | "activity-project"
  | "activity-customer"
  | "project-customer";

export interface ActiveTimer {
  id: number;
  projectId: number;
  activityId: number;
  project: string;
  projectColor: string;
  activityColor: string;
  customerColor: string;
  activity: string;
  description: string;
  tags: string[];
  metadata?: Record<string, string>;
  beginSeconds: number;
  beginIso: string;
}

export interface RecentTask {
  key: string;
  projectId: number;
  activityId: number;
  timesheetId: number;
  project: string;
  projectColor: string;
  activityColor: string;
  customerColor: string;
  customer: string;
  activity: string;
  description: string;
  tags: string[];
  metadata?: Record<string, string>;
  lastUsed: string;
}

export interface SavedConnection {
  id: string;
  name: string;
  url: string;
}

/** Custom hex colors for the tray status icon in each timer state. */
export interface TrayStateColors {
  idle: string;
  running: string;
  paused: string;
  error: string;
}

export interface FeatureSettings {
  featureNote: boolean;
  featureTags: boolean;
  featurePausedTimerDescriptionHover: boolean;
  featureCustomerSelect: boolean;
  featureCustomStartTime: boolean;
  /** Show configurable required/full daily work goals in the Today section. */
  featureDailyGoal: boolean;
  /** Required daily work duration in minutes. */
  dailyGoalMinutes: number;
  /** Full daily work duration in minutes; always at least the required goal. */
  fullDailyGoalMinutes: number;
  /** Category Mode: replace the recent/favorites panel with a fixed 2-level category
   *  menu for the Customer Success / Helpdesk team. Off by default. */
  featureCategoryMode: boolean;
}

export interface PluginSettings {
  /** Creative issue link: adds an "Issue / Ticket" field to new timers and
   *  stores it as the `issue_link` timesheet meta value on the Kimai server. */
  creativeIssueLink: boolean;
}

export type TimesheetCustomFieldType = "text" | "url";

export interface TimesheetCustomFieldDefinition {
  /** Technical/internal field name configured in Kimai. */
  name: string;
  /** Label shown in KimaiTray. */
  label: string;
  type: TimesheetCustomFieldType;
  required: boolean;
}

export interface AppSettings {
  kimaiUrl: string;
  connections: SavedConnection[];
  activeConnectionId: string;

  language: "sk" | "en" | "cs" | "de" | "uk" | "system";

  launchAtLogin: boolean;
  refreshInterval: number;
  openKimaiInBrowser: boolean;

  showElapsedInTray: boolean;
  showTaskNameInTray: boolean;
  menuBarLabelStyle: "timer" | "project" | "activity" | "hidden";
  showSecondsInTimer: boolean;
  trayIconSize: "small" | "medium" | "large" | "xlarge";
  trayIconShape: "dot" | "ring" | "square" | "clock";
  trayColors: TrayStateColors;

  enableIdleDetection: boolean;
  idleThresholdMinutes: number;
  idleAction: "ask" | "stop" | "discard" | "continue";
  showIdleNotification: boolean;
  /** macOS: stop the active timer as soon as the screen saver starts. */
  stopTimerOnScreensaver: boolean;
  /** macOS: stop the active timer as soon as the user session is locked. */
  stopTimerOnScreenLock: boolean;

  enableNoTimerReminder: boolean;
  noTimerReminderMinutes: number;

  theme: "light" | "dark" | "transparent";
  uiSize: "small" | "default" | "large" | "scale130" | "scale145" | "scale160";
  /** Base tray popup height in logical pixels, before UI scaling. */
  popupHeight: number;
  roundedPopupCorners: boolean;
  reduceVisualEffects: boolean;
  accentStyle: "blue" | "green" | "purple" | "orange" | "red";
  popupLayout: "classic" | "focus" | "taskbar" | "timeline";
  colorMode: ColorMode;

  // Feature toggles are per-connection, keyed by connection id.
  features: Record<string, FeatureSettings>;

  // Plugin toggles are per-connection, keyed by connection id.
  plugins: Record<string, PluginSettings>;

  // Timesheet custom fields are configured per Kimai connection because the
  // REST API exposes values, but not the server-side field definitions.
  timesheetCustomFields: Record<string, TimesheetCustomFieldDefinition[]>;

  shortcutTogglePopup: string;
  shortcutStartStopTimer: string;
  shortcutNewTask: string;
  shortcutPauseResume: string;
  shortcutContinueLastTask: string;
  shortcutEditNote: string;
  shortcutOpenKimai: string;
  shortcutOpenSettings: string;

  trayLeftClickAction: "popup" | "nothing";
  trayRightClickAction: "menu" | "popup";

  displayMode: "tray" | "detached";
  trueTrayMode: boolean;

  popupMonitorMode: "active" | "specific";
  popupMonitorIndex: number;
  popupMonitorPosition: "bottom-right" | "bottom-left" | "top-right" | "top-left" | "center";

  autoUpdate: boolean;

  issueIntegrations: Record<string, IssueIntegrationSettings>;
}

export interface FavoriteTask {
  key: string;
  connectionId?: string;
  /** Legacy scope used before favorites were isolated by connection id. */
  baseUrl?: string;
  projectId: number;
  activityId: number;
  project: string;
  activity: string;
  customer: string;
  description: string;
  tags: string[];
  metadata?: Record<string, string>;
  projectColor: string;
  activityColor: string;
  customerColor: string;
}

export interface TodayEntry {
  id: number;
  projectId: number;
  activityId: number;
  project: string;
  projectColor: string;
  activityColor: string;
  customerColor: string;
  customer: string;
  activity: string;
  description: string;
  tags: string[];
  metadata?: Record<string, string>;
  billable: boolean;
  beginIso: string;
  endIso: string | null;
  duration: number | null;
  isRunning: boolean;
}

export type SettingsSection =
  | "connection"
  | "general"
  | "appearance"
  | "tray"
  | "features"
  | "integrations"
  | "reminder"
  | "idle"
  | "shortcuts"
  | "test"
  | "about";
