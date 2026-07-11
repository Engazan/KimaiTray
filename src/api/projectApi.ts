import {
  expectArrayResponse,
  expectObjectResponse,
  type KimaiClient,
} from "./kimaiClient";
import type {
  KimaiCustomer,
  KimaiProject,
  CustomerListParams,
  ProjectListParams,
} from "./kimaiTypes";
import {
  isKimaiCustomer,
  isKimaiProject,
} from "./kimaiValidation";

export async function getProjects(
  client: KimaiClient,
  params?: ProjectListParams,
): Promise<KimaiProject[]> {
  const path = "/api/projects";
  return expectArrayResponse<KimaiProject>(
    await client.get<unknown>(path, params),
    path,
    isKimaiProject,
  );
}

export async function getProject(
  client: KimaiClient,
  id: number,
): Promise<KimaiProject> {
  const path = `/api/projects/${id}`;
  return expectObjectResponse<KimaiProject>(
    await client.get<unknown>(path),
    path,
    "GET",
    isKimaiProject,
  );
}

export async function getCustomers(
  client: KimaiClient,
  params?: CustomerListParams,
): Promise<KimaiCustomer[]> {
  const path = "/api/customers";
  return expectArrayResponse<KimaiCustomer>(
    await client.get<unknown>(path, params),
    path,
    isKimaiCustomer,
  );
}

export async function getCustomer(
  client: KimaiClient,
  id: number,
): Promise<KimaiCustomer> {
  const path = `/api/customers/${id}`;
  return expectObjectResponse<KimaiCustomer>(
    await client.get<unknown>(path),
    path,
    "GET",
    isKimaiCustomer,
  );
}
