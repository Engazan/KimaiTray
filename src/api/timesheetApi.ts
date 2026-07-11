import {
  expectArrayResponse,
  expectObjectResponse,
  type KimaiClient,
} from "./kimaiClient";
import type {
  KimaiTimesheetCreate,
  KimaiTimesheetEntry,
  KimaiTimesheetUpdate,
  TimesheetListParams,
} from "./kimaiTypes";

export async function getActiveTimesheets(
  client: KimaiClient,
): Promise<KimaiTimesheetEntry[]> {
  const path = "/api/timesheets/active";
  return expectArrayResponse<KimaiTimesheetEntry>(
    await client.get<unknown>(path),
    path,
  );
}

export async function getRecentTimesheets(
  client: KimaiClient,
  size = 10,
): Promise<KimaiTimesheetEntry[]> {
  const path = "/api/timesheets/recent";
  return expectArrayResponse<KimaiTimesheetEntry>(await client.get<unknown>(path, {
    size,
  }), path);
}

export async function getTimesheets(
  client: KimaiClient,
  params?: TimesheetListParams,
): Promise<KimaiTimesheetEntry[]> {
  const path = "/api/timesheets";
  return expectArrayResponse<KimaiTimesheetEntry>(
    await client.get<unknown>(path, params),
    path,
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
  );
}

export async function deleteTimesheet(
  client: KimaiClient,
  id: number,
): Promise<void> {
  return client.del(`/api/timesheets/${id}`);
}
