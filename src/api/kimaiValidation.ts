import type {
  KimaiActivity,
  KimaiCustomer,
  KimaiProject,
  KimaiTimesheetEntry,
  KimaiUser,
  KimaiVersion,
} from "./kimaiTypes";

type UnknownRecord = Record<string, unknown>;

function isRecord(value: unknown): value is UnknownRecord {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isPositiveInteger(value: unknown): value is number {
  return isFiniteNumber(value) && Number.isInteger(value) && value > 0;
}

function parseTimestamp(value: unknown): number | null {
  if (typeof value !== "string" || value.trim() === "") return null;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? timestamp : null;
}

function isIdReference(value: unknown): value is number | { id: number } {
  return (
    isPositiveInteger(value) ||
    (isRecord(value) && isPositiveInteger(value.id))
  );
}

export function isKimaiTimesheet(value: unknown): value is KimaiTimesheetEntry {
  if (!isRecord(value)) return false;
  const begin = parseTimestamp(value.begin);
  const end = value.end === null ? null : parseTimestamp(value.end);
  return (
    isPositiveInteger(value.id) &&
    begin !== null &&
    (value.end === null || end !== null) &&
    (end === null || end >= begin) &&
    (value.duration === null ||
      (isFiniteNumber(value.duration) && value.duration >= 0)) &&
    typeof value.billable === "boolean" &&
    Array.isArray(value.tags) &&
    value.tags.every((tag) => typeof tag === "string") &&
    isIdReference(value.project) &&
    isIdReference(value.activity)
  );
}

export function isKimaiProject(value: unknown): value is KimaiProject {
  return (
    isRecord(value) &&
    isPositiveInteger(value.id) &&
    typeof value.name === "string" &&
    isPositiveInteger(value.customer)
  );
}

export function isKimaiActivity(value: unknown): value is KimaiActivity {
  return (
    isRecord(value) &&
    isPositiveInteger(value.id) &&
    typeof value.name === "string" &&
    (value.project === null || isPositiveInteger(value.project))
  );
}

export function isKimaiCustomer(value: unknown): value is KimaiCustomer {
  return (
    isRecord(value) &&
    isPositiveInteger(value.id) &&
    typeof value.name === "string"
  );
}

export function isKimaiUser(value: unknown): value is KimaiUser {
  return (
    isRecord(value) &&
    isPositiveInteger(value.id) &&
    typeof value.username === "string" &&
    (value.alias === null || typeof value.alias === "string")
  );
}

export function isKimaiVersion(value: unknown): value is KimaiVersion {
  return isRecord(value) && typeof value.version === "string";
}
