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
  lastUsed: string;
}

export interface SavedConnection {
  id: string;
  name: string;
  url: string;
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
  trayIconSize: "small" | "medium" | "large";
  trayIconShape: "dot" | "ring" | "square" | "clock";

  enableIdleDetection: boolean;
  idleThresholdMinutes: number;
  idleAction: "ask" | "stop" | "discard" | "continue";
  showIdleNotification: boolean;

  theme: "light" | "dark" | "transparent";
  uiSize: "small" | "default" | "large";
  roundedPopupCorners: boolean;
  reduceVisualEffects: boolean;
  accentStyle: "blue" | "green" | "purple" | "orange" | "red";
  popupLayout: "classic" | "focus" | "taskbar" | "timeline";
  colorMode: ColorMode;

  featureNote: boolean;
  featureTags: boolean;
  featurePausedTimerDescriptionHover: boolean;
  featureCustomerSelect: boolean;
  featureCustomStartTime: boolean;

  shortcutTogglePopup: string;
  shortcutStartStopTimer: string;
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
  baseUrl?: string;
  projectId: number;
  activityId: number;
  project: string;
  activity: string;
  customer: string;
  description: string;
  tags: string[];
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
  | "idle"
  | "shortcuts"
  | "test"
  | "about";
