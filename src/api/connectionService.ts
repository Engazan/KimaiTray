import i18n from "../shared/i18n";
import {
  createKimaiClient,
  expectArrayResponse,
  expectObjectResponse,
  isInsecureUrl,
  KimaiApiError,
  type KimaiClient,
} from "./kimaiClient";
import type {
  KimaiMetaFieldRule,
  KimaiUser,
  KimaiVersion,
} from "./kimaiTypes";
import { isKimaiUser, isKimaiVersion } from "./kimaiValidation";
import type { TimesheetCustomFieldDefinition } from "../types";

export interface ConnectionResult {
  success: boolean;
  user?: KimaiUser;
  version?: KimaiVersion;
  customFields?: TimesheetCustomFieldDefinition[];
  insecure?: boolean;
  error?: string;
  errorCode?: string;
}

const CUSTOM_FIELDS_PATH = "/api/metafields";

function toCustomFieldDefinition(
  value: unknown,
): TimesheetCustomFieldDefinition | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const rule = value as Partial<KimaiMetaFieldRule>;
  if (typeof rule.name !== "string" || rule.visible === false) return null;

  const name = rule.name.trim().toLowerCase();
  if (!/^[a-z0-9_-]{2,50}$/.test(name)) return null;
  const label =
    typeof rule.label === "string" && rule.label.trim()
      ? rule.label.trim().slice(0, 256)
      : name;
  const apiType = typeof rule.type === "string" ? rule.type.toLowerCase() : "";

  return {
    name,
    label,
    type: apiType.includes("url") ? "url" : "text",
    required: rule.required === true,
  };
}

export async function getTimesheetCustomFieldDefinitions(
  client: KimaiClient,
): Promise<TimesheetCustomFieldDefinition[]> {
  const rules = expectArrayResponse<unknown>(
    await client.get<unknown>(CUSTOM_FIELDS_PATH, { entity: "timesheet" }),
    CUSTOM_FIELDS_PATH,
  );
  const names = new Set<string>();
  const definitions: TimesheetCustomFieldDefinition[] = [];
  for (const rule of rules) {
    const definition = toCustomFieldDefinition(rule);
    if (!definition || names.has(definition.name)) continue;
    names.add(definition.name);
    definitions.push(definition);
  }
  return definitions;
}

export async function getCurrentUser(
  client: KimaiClient,
): Promise<KimaiUser> {
  const path = "/api/users/me";
  return expectObjectResponse<KimaiUser>(
    await client.get<unknown>(path),
    path,
    "GET",
    isKimaiUser,
  );
}

export async function getVersion(
  client: KimaiClient,
): Promise<KimaiVersion> {
  const path = "/api/version";
  return expectObjectResponse<KimaiVersion>(
    await client.get<unknown>(path),
    path,
    "GET",
    isKimaiVersion,
  );
}

export async function testConnection(
  baseUrl: string,
  token: string,
): Promise<ConnectionResult> {
  if (!baseUrl) {
    return { success: false, error: i18n.t("connection.urlRequired") };
  }
  if (!token) {
    return { success: false, error: i18n.t("connection.tokenRequired") };
  }

  const insecure = isInsecureUrl(baseUrl);
  const client = createKimaiClient(baseUrl, token);

  try {
    const [user, version] = await Promise.all([
      getCurrentUser(client),
      getVersion(client),
    ]);
    let customFields: TimesheetCustomFieldDefinition[] | undefined;
    try {
      customFields = await getTimesheetCustomFieldDefinitions(client);
    } catch {
      // Custom-field discovery is provided by an optional Kimai plugin. A
      // missing or inaccessible endpoint must not fail a valid connection.
    }
    return { success: true, user, version, customFields, insecure };
  } catch (err) {
    if (err instanceof KimaiApiError) {
      return {
        success: false,
        error: err.message,
        errorCode: err.code,
        insecure,
      };
    }
    return {
      success: false,
      error: err instanceof Error ? err.message : "Unknown error",
      insecure,
    };
  }
}
