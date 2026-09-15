import { SpentTimeRejectedError } from "./spentTimeError";
import { describe, expect, it, vi } from "vitest";
import { IssueTimeSyncQueue, matchesTimeSyncSession, type TimeSyncJob, type TimeSyncSession } from "./issueTimeSyncQueue";
import type { KimaiClient } from "../../api/kimaiClient";
import type { KimaiTimesheetEntry } from "../../api/kimaiTypes";
import type { ExternalIssue, IssueIntegrationSettings } from "./types";

const issue: ExternalIssue = { id: 8, webUrl: "https://git.test/group/project/-/issues/8", title: "Task", state: "opened", labels: [], author: "a" };
const config: IssueIntegrationSettings = { enabled: true, provider: "gitlab", baseUrl: "https://git.test", apiBaseUrl: "", projectPathOrRepo: "group/project", syncTime: true, autoInsertUrl: false, showTimeEstimate: true, defaultState: "opened", assigneeOnly: false, filterLabels: [], filterLabelsMode: "include" };
const client: KimaiClient = { connectionId: "work", baseUrl: "https://kimai.test", cacheScope: "work:1", get: vi.fn(), post: vi.fn(), patch: vi.fn(), del: vi.fn() };
const entry = (patch: Partial<KimaiTimesheetEntry> = {}): KimaiTimesheetEntry => ({ id: 42, begin: "2026-09-15T08:00:00Z", end: "2026-09-15T09:00:00Z", duration: 3600, project: 1, activity: 1, user: 1, description: "", tags: [], rate: 0, internalRate: 0, exported: false, billable: true, ...patch });
function setup() {
  let disk: TimeSyncJob[] = [];
  const repository = {
    read: vi.fn(async () => structuredClone(disk)),
    write: vi.fn(async (_id: string, jobs: TimeSyncJob[]) => { disk = structuredClone(jobs); }),
  };
  const get = vi.fn(async () => entry());
  const session: TimeSyncSession = { client, config, isCurrent: () => true, send: vi.fn(async () => {}) };
  const queue = new IssueTimeSyncQueue(repository, get);
  return { repository, get, session, queue, disk: () => disk };
}

describe("durable issue time synchronization", () => {
  it("recovers a watched timer after restart and never posts a completed timesheet twice", async () => {
    const s = setup();
    await s.queue.track(s.session, 42, issue);
    await s.queue.track(s.session, 42, issue);
    expect(s.disk()).toHaveLength(1);
    const restarted = new IssueTimeSyncQueue(s.repository, s.get);
    await Promise.all([restarted.drain(s.session), restarted.drain(s.session)]);
    expect(s.session.send).toHaveBeenCalledOnce();
    expect(s.session.send).toHaveBeenCalledWith(expect.objectContaining({ timesheetId: 42 }), 3600);
    await restarted.track(s.session, 42, issue);
    await restarted.drain(s.session);
    expect(s.disk()[0].status).toBe("done");
    expect(s.session.send).toHaveBeenCalledOnce();
  });

  it("waits for both the known active timer and an API-reported running timer", async () => {
    const s = setup();
    await s.queue.track(s.session, 42, issue);
    await s.queue.drain({ ...s.session, runningTimerId: 42 });
    expect(s.get).not.toHaveBeenCalled();
    s.get.mockResolvedValue(entry({ end: null, duration: 120 }));
    await s.queue.drain(s.session);
    expect(s.session.send).not.toHaveBeenCalled();
    expect(s.disk()[0].status).toBe("watching");
  });

  it("retries reads after backoff and retains invalid durations for later reconciliation", async () => {
    const s = setup();
    await s.queue.track(s.session, 42, issue);
    s.get.mockRejectedValueOnce(new Error("offline"));
    await s.queue.drain(s.session, 100);
    expect(s.disk()[0].error).toBe("read");
    await s.queue.drain(s.session, 101);
    expect(s.get).toHaveBeenCalledOnce();
    s.get.mockResolvedValueOnce(entry({ duration: null, begin: "invalid" }));
    await s.queue.drain(s.session, 60_100);
    expect(s.disk()[0].error).toBe("read");
    await s.queue.drain(s.session, 120_100);
    expect(s.disk()[0].status).toBe("done");
    expect(s.session.send).toHaveBeenCalledOnce();
  });

  it("retries explicit rejections but requires review after ambiguous writes", async () => {
    const s = setup();
    await s.queue.track(s.session, 42, issue);
    vi.mocked(s.session.send).mockRejectedValueOnce(new SpentTimeRejectedError(429));
    await s.queue.drain(s.session, 0);
    expect(s.disk()[0]).toMatchObject({ status: "watching", error: "rejected" });
    vi.mocked(s.session.send).mockRejectedValueOnce(new Error("response lost"));
    await s.queue.drain(s.session, 60_000);
    expect(s.disk()[0].status).toBe("uncertain");
    await new IssueTimeSyncQueue(s.repository, s.get).drain(s.session, 120_000);
    expect(s.session.send).toHaveBeenCalledTimes(2);
    await s.queue.resolve(s.session, s.disk()[0].id, "retry");
    await s.queue.drain(s.session);
    expect(s.session.send).toHaveBeenCalledTimes(3);
  });

  it("requires review when the app crashed during a write or completion could not be saved", async () => {
    const s = setup();
    await s.queue.track(s.session, 42, issue);
    // Simulate the sending marker on durable disk, followed by failure to save done.
    const saved = structuredClone(s.disk());
    saved[0].status = "sending";
    s.repository.write.mockReset();
    s.repository.write.mockImplementation(async (_id, jobs) => {
      if (jobs[0].status === "done") throw new Error("disk full");
      saved.splice(0, saved.length, ...structuredClone(jobs));
    });
    s.repository.read.mockImplementation(async () => structuredClone(saved));
    const recovering = new IssueTimeSyncQueue(s.repository, s.get);
    await recovering.drain(s.session);
    expect(saved[0].status).toBe("uncertain");
    expect(s.session.send).not.toHaveBeenCalled();
    await recovering.resolve(s.session, saved[0].id, "retry");
    await expect(recovering.drain(s.session)).rejects.toThrow("disk full");
    expect(saved[0].status).toBe("sending");
    await recovering.drain(s.session);
    expect(saved[0].status).toBe("uncertain");
    expect(s.session.send).toHaveBeenCalledOnce();
  });

  it("never sends before durable persistence and retries an unsaved association in memory", async () => {
    const s = setup();
    s.repository.write.mockRejectedValueOnce(new Error("disk full"));
    await expect(s.queue.track(s.session, 42, issue)).rejects.toThrow();
    await s.queue.drain(s.session);
    expect(s.session.send).toHaveBeenCalledOnce();
    const next = setup();
    await next.queue.track(next.session, 42, issue);
    next.repository.write.mockRejectedValueOnce(new Error("disk full"));
    await expect(next.queue.drain(next.session)).rejects.toThrow();
    expect(next.session.send).not.toHaveBeenCalled();
  });

  it("isolates changed destinations and credentials, and checks the session again before sending", async () => {
    const s = setup();
    await s.queue.track(s.session, 42, issue);
    const changed = { ...s.session, config: { ...config, projectPathOrRepo: "other/repo" } };
    await s.queue.drain(changed);
    await s.queue.drain({ ...s.session, isCurrent: () => false });
    await s.queue.resolve(changed, s.disk()[0].id, "retry");
    await s.queue.resolve(s.session, "missing", "recorded");
    expect(s.session.send).not.toHaveBeenCalled();
    expect(matchesTimeSyncSession(s.disk()[0], { ...s.session, client: { ...client, connectionId: "other" } })).toBe(false);
    expect(matchesTimeSyncSession(s.disk()[0], { ...s.session, client: { ...client, baseUrl: "https://other.test" } })).toBe(false);
    const isCurrent = vi.fn().mockReturnValueOnce(true).mockReturnValueOnce(false);
    await s.queue.drain({ ...s.session, isCurrent });
    expect(s.session.send).not.toHaveBeenCalled();
    const expiresBeforeSend = vi.fn().mockReturnValueOnce(true).mockReturnValueOnce(true).mockReturnValue(false);
    await s.queue.drain({ ...s.session, isCurrent: expiresBeforeSend });
    expect(s.disk()[0].status).toBe("watching");
    expect(s.session.send).not.toHaveBeenCalled();
  });

  it("records short entries locally and lets users acknowledge uncertain writes without posting", async () => {
    const s = setup();
    await s.queue.track(s.session, 42, issue);
    s.get.mockResolvedValueOnce(entry({ duration: 30 }));
    await s.queue.drain(s.session);
    expect(s.disk()[0].status).toBe("done");
    await s.queue.track(s.session, 43, issue);
    vi.mocked(s.session.send).mockRejectedValueOnce(new Error("timeout"));
    await s.queue.drain(s.session);
    await s.queue.resolve(s.session, s.disk()[1].id, "recorded");
    await s.queue.drain(s.session);
    expect(s.session.send).toHaveBeenCalledOnce();
  });
});
