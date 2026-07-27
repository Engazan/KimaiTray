export {
  createKimaiClient,
  normalizeBaseUrl,
  buildApiUrl,
  isInsecureUrl,
  KimaiApiError,
  type KimaiClient,
  type KimaiErrorCode,
  type QueryParams,
} from "./kimaiClient";

export type {
  KimaiVersion,
  KimaiUser,
  KimaiCustomer,
  KimaiProject,
  KimaiActivity,
  KimaiMetaField,
  KimaiTimesheetEntry,
  KimaiTimesheetCreate,
  KimaiTimesheetMetaUpdate,
  KimaiTimesheetUpdate,
  TimesheetListParams,
  ProjectListParams,
  ActivityListParams,
  CustomerListParams,
} from "./kimaiTypes";

export {
  testConnection,
  getCurrentUser,
  getVersion,
  type ConnectionResult,
} from "./connectionService";

export {
  getActiveTimesheets,
  getRecentTimesheets,
  getTimesheets,
  getTimesheet,
  startTimesheet,
  stopTimesheet,
  restartTimesheet,
  updateTimesheet,
  updateTimesheetMeta,
  deleteTimesheet,
} from "./timesheetApi";

export {
  getProjects,
  getProject,
  getCustomers,
  getCustomer,
} from "./projectApi";

export {
  getActivities,
  getActivitiesForProject,
  getActivity,
} from "./activityApi";

export {
  saveApiToken,
  getApiToken,
  deleteApiToken,
} from "./secureStore";
