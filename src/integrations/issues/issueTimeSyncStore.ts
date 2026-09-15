import { load } from "@tauri-apps/plugin-store";
import { mutateScopedStore } from "../../api/scopedStore";
import type { TimeSyncJob, TimeSyncRepository } from "./issueTimeSyncQueue";

const KEY = "issueTimeSyncJobs";

function isJob(value: unknown, connectionId: string): value is TimeSyncJob {
  if (!value || typeof value !== "object") return false;
  const job = value as TimeSyncJob;
  const validUrl = (value: string) => {
    try {
      const url = new URL(value);
      return ["http:", "https:"].includes(url.protocol) && !url.username && !url.password;
    } catch { return false; }
  };
  return job.connectionId === connectionId && typeof job.id === "string" &&
    typeof job.kimaiUrl === "string" && validUrl(job.kimaiUrl) && typeof job.destination === "string" &&
    Number.isSafeInteger(job.timesheetId) && job.timesheetId > 0 &&
    Number.isSafeInteger(job.issueId) && job.issueId > 0 && typeof job.issueUrl === "string" && validUrl(job.issueUrl) &&
    job.id === JSON.stringify([job.kimaiUrl, job.timesheetId]) &&
    ["watching", "sending", "uncertain", "done"].includes(job.status) &&
    Number.isFinite(job.nextAttemptAt) && [null, "read", "rejected"].includes(job.error);
}

export const issueTimeSyncRepository: TimeSyncRepository = {
  async read(connectionId) {
    const store = await load("settings.json", { defaults: {}, autoSave: true });
    const map = await store.get<Record<string, unknown>>(KEY);
    if (map !== null && map !== undefined && (typeof map !== "object" || Array.isArray(map))) {
      throw new Error("Invalid issue time sync history");
    }
    const value = map?.[connectionId];
    if (value === undefined) return [];
    if (!Array.isArray(value) || !value.every((job) => isJob(job, connectionId))) {
      throw new Error("Invalid issue time sync history");
    }
    if (new Set(value.map((job) => job.id)).size !== value.length) {
      throw new Error("Invalid issue time sync history");
    }
    return value;
  },
  async write(connectionId, jobs) {
    await mutateScopedStore(KEY, connectionId, { type: "set", value: jobs });
  },
};
