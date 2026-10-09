import {
  expectArrayResponse,
  expectObjectResponse,
  type KimaiClient,
} from "./kimaiClient";
import type {
  KimaiTimesheetCreate,
  KimaiTimesheetEntry,
  KimaiTimesheetMetaUpdate,
  KimaiTimesheetUpdate,
  TimesheetListParams,
} from "./kimaiTypes";
import { isKimaiTimesheet } from "./kimaiValidation";

export async function getActiveTimesheets(
  client: KimaiClient,
): Promise<KimaiTimesheetEntry[]> {
  const path = "/api/timesheets/active";
  return expectArrayResponse<KimaiTimesheetEntry>(
    await client.get<unknown>(path),
    path,
    isKimaiTimesheet,
  );
}

/** How many timers a user may run at once on this instance (Kimai's
 * `timesheet.active_entries.hard_limit`). Falls back to 1 when the response
 * carries no usable value. */
export async function getActiveEntriesLimit(client: KimaiClient): Promise<number> {
  const path = "/api/config/timesheet";
  const config = expectObjectResponse<{ activeEntriesHardLimit?: unknown }>(
    await client.get<unknown>(path),
    path,
  );
  const limit = config.activeEntriesHardLimit;
  return typeof limit === "number" && Number.isInteger(limit) && limit > 1 ? limit : 1;
}

export async function getRecentTimesheets(
  client: KimaiClient,
  size = 10,
): Promise<KimaiTimesheetEntry[]> {
  const path = "/api/timesheets/recent";
  return expectArrayResponse<KimaiTimesheetEntry>(
    await client.get<unknown>(path, { size }),
    path,
    isKimaiTimesheet,
  );
}

export async function getTimesheets(
  client: KimaiClient,
  params?: TimesheetListParams,
): Promise<KimaiTimesheetEntry[]> {
  const path = "/api/timesheets";
  return expectArrayResponse<KimaiTimesheetEntry>(
    await client.get<unknown>(path, params),
    path,
    isKimaiTimesheet,
  );
}

export async function getTimesheet(
  client: KimaiClient,
  id: number,
): Promise<KimaiTimesheetEntry> {
  const path = `/api/timesheets/${id}`;
  return expectObjectResponse<KimaiTimesheetEntry>(
    await client.get<unknown>(path),
    path,
    "GET",
    isKimaiTimesheet,
  );
}

export async function startTimesheet(
  client: KimaiClient,
  payload: KimaiTimesheetCreate,
): Promise<KimaiTimesheetEntry> {
  const path = "/api/timesheets";
  return expectObjectResponse<KimaiTimesheetEntry>(
    await client.post<unknown>(path, payload),
    path,
    "POST",
    isKimaiTimesheet,
  );
}

export async function stopTimesheet(
  client: KimaiClient,
  id: number,
): Promise<KimaiTimesheetEntry> {
  const path = `/api/timesheets/${id}/stop`;
  return expectObjectResponse<KimaiTimesheetEntry>(
    await client.patch<unknown>(path),
    path,
    "PATCH",
    isKimaiTimesheet,
  );
}

export async function restartTimesheet(
  client: KimaiClient,
  id: number,
): Promise<KimaiTimesheetEntry> {
  const path = `/api/timesheets/${id}/restart`;
  return expectObjectResponse<KimaiTimesheetEntry>(
    await client.patch<unknown>(path),
    path,
    "PATCH",
    isKimaiTimesheet,
  );
}

export async function updateTimesheet(
  client: KimaiClient,
  id: number,
  payload: KimaiTimesheetUpdate,
): Promise<KimaiTimesheetEntry> {
  const path = `/api/timesheets/${id}`;
  return expectObjectResponse<KimaiTimesheetEntry>(
    await client.patch<unknown>(path, payload),
    path,
    "PATCH",
    isKimaiTimesheet,
  );
}

export async function updateTimesheetMeta(
  client: KimaiClient,
  id: number,
  payload: KimaiTimesheetMetaUpdate,
): Promise<KimaiTimesheetEntry> {
  const path = `/api/timesheets/${id}/meta`;
  return expectObjectResponse<KimaiTimesheetEntry>(
    await client.patch<unknown>(path, payload),
    path,
    "PATCH",
    isKimaiTimesheet,
  );
}

export async function deleteTimesheet(
  client: KimaiClient,
  id: number,
): Promise<void> {
  return client.del(`/api/timesheets/${id}`);
}
