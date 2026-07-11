import { expectArrayResponse, type KimaiClient } from "./kimaiClient";
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
  return client.get<KimaiTimesheetEntry>(`/api/timesheets/${id}`);
}

export async function startTimesheet(
  client: KimaiClient,
  payload: KimaiTimesheetCreate,
): Promise<KimaiTimesheetEntry> {
  return client.post<KimaiTimesheetEntry>("/api/timesheets", payload);
}

export async function stopTimesheet(
  client: KimaiClient,
  id: number,
): Promise<KimaiTimesheetEntry> {
  return client.patch<KimaiTimesheetEntry>(`/api/timesheets/${id}/stop`);
}

export async function restartTimesheet(
  client: KimaiClient,
  id: number,
): Promise<KimaiTimesheetEntry> {
  return client.patch<KimaiTimesheetEntry>(
    `/api/timesheets/${id}/restart`,
  );
}

export async function updateTimesheet(
  client: KimaiClient,
  id: number,
  payload: KimaiTimesheetUpdate,
): Promise<KimaiTimesheetEntry> {
  return client.patch<KimaiTimesheetEntry>(
    `/api/timesheets/${id}`,
    payload,
  );
}

export async function deleteTimesheet(
  client: KimaiClient,
  id: number,
): Promise<void> {
  return client.del(`/api/timesheets/${id}`);
}
