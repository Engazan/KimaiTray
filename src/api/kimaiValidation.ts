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

function isIdReference(value: unknown): value is number | { id: number } {
  return (
    isFiniteNumber(value) ||
    (isRecord(value) && isFiniteNumber(value.id))
  );
}

export function isKimaiTimesheet(value: unknown): value is KimaiTimesheetEntry {
  return (
    isRecord(value) &&
    isFiniteNumber(value.id) &&
    typeof value.begin === "string" &&
    (value.end === null || typeof value.end === "string") &&
    (value.duration === null || isFiniteNumber(value.duration)) &&
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
    isFiniteNumber(value.id) &&
    typeof value.name === "string" &&
    isFiniteNumber(value.customer)
  );
}

export function isKimaiActivity(value: unknown): value is KimaiActivity {
  return (
    isRecord(value) &&
    isFiniteNumber(value.id) &&
    typeof value.name === "string" &&
    (value.project === null || isFiniteNumber(value.project))
  );
}

export function isKimaiCustomer(value: unknown): value is KimaiCustomer {
  return (
    isRecord(value) &&
    isFiniteNumber(value.id) &&
    typeof value.name === "string"
  );
}

export function isKimaiUser(value: unknown): value is KimaiUser {
  return (
    isRecord(value) &&
    isFiniteNumber(value.id) &&
    typeof value.username === "string" &&
    (value.alias === null || typeof value.alias === "string")
  );
}

export function isKimaiVersion(value: unknown): value is KimaiVersion {
  return isRecord(value) && typeof value.version === "string";
}
