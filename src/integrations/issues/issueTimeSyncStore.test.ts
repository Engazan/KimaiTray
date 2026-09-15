import { beforeEach, describe, expect, it, vi } from "vitest";
import { issueTimeSyncRepository } from "./issueTimeSyncStore";

const mock = vi.hoisted(() => ({ get: vi.fn(), load: vi.fn(), mutateScopedStore: vi.fn() }));
vi.mock("@tauri-apps/plugin-store", () => ({ load: mock.load }));
vi.mock("../../api/scopedStore", () => ({ mutateScopedStore: mock.mutateScopedStore }));
const job = {
  id: JSON.stringify(["https://kimai.test", 42]), connectionId: "work", kimaiUrl: "https://kimai.test",
  destination: "target", timesheetId: 42, issueId: 8, issueUrl: "https://git.test/8",
  status: "watching" as const, nextAttemptAt: 0, error: null,
};
beforeEach(() => {
  vi.resetAllMocks();
  mock.load.mockResolvedValue({ get: mock.get });
});

describe("time sync persistence boundary", () => {
  it("reads only the requested connection and uses the atomic native writer", async () => {
    mock.get.mockResolvedValue({ work: [job], other: [] });
    await expect(issueTimeSyncRepository.read("work")).resolves.toEqual([job]);
    await issueTimeSyncRepository.write("work", [job]);
    expect(mock.mutateScopedStore).toHaveBeenCalledWith("issueTimeSyncJobs", "work", { type: "set", value: [job] });
    expect(mock.load).toHaveBeenCalledWith("settings.json", { defaults: {}, autoSave: true });
  });
  it.each([undefined, null, {}])("treats absent history as empty (%s)", async (value) => {
    mock.get.mockResolvedValue(value);
    await expect(issueTimeSyncRepository.read("work")).resolves.toEqual([]);
  });
  it.each([
    { work: [job, job] }, [], "corrupt", { work: {} }, { work: [null] }, { work: [42] },
    { work: [{ ...job, connectionId: "other" }] },
    { work: [{ ...job, issueUrl: "javascript:alert(1)" }] },
    { work: [{ ...job, issueUrl: "invalid" }] },
    { work: [{ ...job, issueUrl: "https://user:secret@git.test/8" }] },
    { work: [{ ...job, id: "wrong" }] },
    { work: [{ ...job, status: "unknown" }] },
  ])("fails closed on corrupted history", async (value) => {
    mock.get.mockResolvedValue(value);
    await expect(issueTimeSyncRepository.read("work")).rejects.toThrow("Invalid issue time sync history");
  });
});
