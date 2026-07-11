import {
  expectArrayResponse,
  expectObjectResponse,
  type KimaiClient,
} from "./kimaiClient";
import type { ActivityListParams, KimaiActivity } from "./kimaiTypes";
import { isKimaiActivity } from "./kimaiValidation";

export async function getActivities(
  client: KimaiClient,
  params?: ActivityListParams,
): Promise<KimaiActivity[]> {
  const path = "/api/activities";
  return expectArrayResponse<KimaiActivity>(
    await client.get<unknown>(path, params),
    path,
    isKimaiActivity,
  );
}

export async function getActivitiesForProject(
  client: KimaiClient,
  projectId: number,
): Promise<KimaiActivity[]> {
  return getActivities(client, { project: projectId });
}

export async function getActivity(
  client: KimaiClient,
  id: number,
): Promise<KimaiActivity> {
  const path = `/api/activities/${id}`;
  return expectObjectResponse<KimaiActivity>(
    await client.get<unknown>(path),
    path,
    "GET",
    isKimaiActivity,
  );
}
