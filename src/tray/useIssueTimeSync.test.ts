// @vitest-environment jsdom
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useIssueTimeSync } from "./useIssueTimeSync";
import type { KimaiClient } from "../api/kimaiClient";
import type { TimeSyncJob } from "../integrations/issues/issueTimeSyncQueue";
import type { ExternalIssue, IssueIntegrationSettings } from "../integrations/issues/types";

const mocks = vi.hoisted(() => ({ read: vi.fn(), write: vi.fn(), get: vi.fn(), send: vi.fn(), provider: vi.fn(), error: vi.fn() }));
vi.mock("../integrations/issues/issueTimeSyncStore", () => ({ issueTimeSyncRepository: { read: mocks.read, write: mocks.write } }));
vi.mock("../api/timesheetApi", () => ({ getTimesheet: mocks.get }));
vi.mock("../integrations/issues/issueProvider", () => ({ createIssueProvider: mocks.provider }));
vi.mock("../utils/logger", () => ({ logger: { error: mocks.error } }));

const client: KimaiClient = { connectionId: "work", baseUrl: "https://kimai.test", cacheScope: "work:1", get: vi.fn(), post: vi.fn(), patch: vi.fn(), del: vi.fn() };
const config: IssueIntegrationSettings = { enabled: true, provider: "gitlab", baseUrl: "https://git.test", apiBaseUrl: "", projectPathOrRepo: "group/project", syncTime: true, autoInsertUrl: false, showTimeEstimate: false, defaultState: "opened", assigneeOnly: false, filterLabels: [], filterLabelsMode: "include" };
const issue: ExternalIssue = { id: 8, webUrl: "https://git.test/other/project/-/issues/8", title: "Task", state: "opened", author: "a", labels: [] };
let disk: TimeSyncJob[];
beforeEach(() => {
  vi.resetAllMocks();
  disk = [];
  mocks.read.mockImplementation(async () => structuredClone(disk));
  mocks.write.mockImplementation(async (_id, jobs) => { disk = structuredClone(jobs); });
  mocks.get.mockResolvedValue({ id: 42, end: "2026-09-15T09:00:00Z", duration: 120 });
  mocks.send.mockResolvedValue(undefined);
  mocks.provider.mockImplementation(() => ({ addSpentTime: mocks.send }));
});
afterEach(() => { cleanup(); vi.useRealTimers(); });
const options = { client, config, token: "secret" };

describe("time sync worker lifecycle", () => {
  it("recovers from unavailable storage on focus/online and retries unsaved associations", async () => {
    mocks.read.mockRejectedValueOnce(new Error("read failed"));
    const { result } = renderHook(() => useIssueTimeSync(options));
    await act(async () => {});
    expect(result.current.storageError).toBe(true);
    await act(async () => { window.dispatchEvent(new Event("focus")); });
    expect(result.current.storageError).toBe(false);
    mocks.write.mockRejectedValueOnce(new Error("write failed"));
    await act(async () => { await result.current.track(42, issue); });
    expect(result.current.storageError).toBe(true);
    expect(mocks.send).not.toHaveBeenCalled();
    await act(async () => { window.dispatchEvent(new Event("online")); });
    expect(result.current.storageError).toBe(false);
    expect(mocks.send).toHaveBeenCalledWith(8, 120);
    expect(mocks.provider).toHaveBeenLastCalledWith(expect.objectContaining({ projectPathOrRepo: "other/project" }), "secret", "work");
  });

  it("persists manual resolution, surfaces its failure and allows another attempt", async () => {
    const { result } = renderHook(() => useIssueTimeSync(options));
    mocks.send.mockRejectedValueOnce(new Error("lost response"));
    await act(async () => { await result.current.track(42, issue); });
    expect(result.current.problems[0].status).toBe("uncertain");
    mocks.write.mockRejectedValueOnce(new Error("write failed"));
    await act(async () => { await result.current.resolve(disk[0].id, "recorded"); });
    expect(result.current.storageError).toBe(true);
    expect(result.current.resolving).toBe(false);
    await act(async () => { await result.current.resolve(disk[0].id, "retry"); });
    expect(result.current.problems).toEqual([]);
    expect(mocks.send).toHaveBeenCalledTimes(2);
  });

  it("polls watched entries and cancels work when the window unmounts", async () => {
    vi.useFakeTimers();
    const { result, unmount } = renderHook(() => useIssueTimeSync({ ...options, timerId: 42 }));
    await act(async () => { await result.current.track(42, issue); });
    mocks.read.mockClear();
    await act(async () => { await vi.advanceTimersByTimeAsync(60_000); });
    expect(mocks.read).toHaveBeenCalled();
    expect(mocks.send).not.toHaveBeenCalled();
    let finish!: (value: TimeSyncJob[]) => void;
    mocks.read.mockImplementationOnce(() => new Promise<TimeSyncJob[]>((resolve) => { finish = resolve; }));
    let pending!: Promise<void>;
    await act(async () => { pending = result.current.flush(); });
    unmount();
    await act(async () => { finish(structuredClone(disk)); await pending; });
    expect(mocks.send).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("ignores late storage errors after a connection change and disables unsupported integrations", async () => {
    const { result, rerender } = renderHook(useIssueTimeSync, { initialProps: options });
    await act(async () => {});
    let fail!: (error: Error) => void;
    mocks.read.mockImplementationOnce(() => new Promise((_resolve, reject) => { fail = reject; }));
    let pending!: Promise<void>;
    await act(async () => { pending = result.current.flush(); });
    rerender({ ...options, config: { ...config, enabled: false } });
    await act(async () => { fail(new Error("old read failed")); await pending; });
    expect(result.current.storageError).toBe(false);
    await act(async () => {
      await result.current.track(42, issue);
      await result.current.flush();
      await result.current.resolve("missing", "recorded");
    });
    mocks.provider.mockReturnValue({});
    rerender({ ...options, config: { ...config, provider: "github" } });
    expect(result.current.session).toBeNull();
  });
});
