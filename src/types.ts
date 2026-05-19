export interface ActiveTimer {
  id: number;
  projectId: number;
  activityId: number;
  project: string;
  projectColor: string;
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

  enableIdleDetection: boolean;
  idleThresholdMinutes: number;
  idleAction: "ask" | "stop" | "discard" | "continue";
  showIdleNotification: boolean;

  theme: "light" | "dark" | "transparent";
  useCompactPopup: boolean;
  roundedPopupCorners: boolean;
  reduceVisualEffects: boolean;
  accentStyle: "blue" | "green" | "purple" | "orange" | "red";
  popupLayout: "classic" | "focus" | "taskbar" | "timeline";

  featureNote: boolean;
  featureTags: boolean;
  featureCustomerSelect: boolean;
  featureCustomStartTime: boolean;

  shortcutTogglePopup: string;
  shortcutStartStopTimer: string;
  shortcutOpenSettings: string;

  autoUpdate: boolean;
}

export interface TodayEntry {
  id: number;
  projectId: number;
  activityId: number;
  project: string;
  projectColor: string;
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
  | "features"
  | "timer"
  | "idle"
  | "shortcuts"
  | "update"
  | "appearance"
  | "about";
