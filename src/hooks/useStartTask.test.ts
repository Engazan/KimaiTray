// @vitest-environment jsdom

import { createElement, type PropsWithChildren } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { KimaiClient } from "../api/kimaiClient";
import { KimaiApiError } from "../api/kimaiClient";
import {
  switchTask,
  TaskMetadataError,
  TaskSwitchError,
  useStartTask,
} from "./useStartTask";
import type { KimaiTimesheetEntry } from "../api/kimaiTypes";

function timesheet(id: number): KimaiTimesheetEntry {
  return {
    id,
    begin: "2026-07-11T09:00:00+0200",
    end: null,
    duration: null,
    description: "",
    rate: 0,
    internalRate: 0,
    exported: false,
    billable: true,
    tags: [],
    activity: 2,
    project: 1,
    user: 1,
  };
}

function mockClient(overrides: Partial<KimaiClient> = {}): KimaiClient {
  return {
    baseUrl: "https://kimai.example.test",
    connectionId: "connection-a",
    get: vi.fn().mockResolvedValueOnce([timesheet(42)]).mockResolvedValue([]),
    post: vi.fn(async () => {
      throw KimaiApiError.fromResponse(422, "Unprocessable Entity", { message: "start failed" });
    }),
    patch: vi.fn(async () => timesheet(42)),
    del: vi.fn(async () => undefined),
    ...overrides,
  } as KimaiClient;
}

describe("transactional timer switching", () => {
  it("restarts a stopped timer after an explicit rejection and an empty active snapshot", async () => {
    const client = mockClient();

    let caught: unknown;
    try {
      await switchTask(client, {
        projectId: 1,
        activityId: 2,
        label: "Replacement",
      });
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(TaskSwitchError);
    expect((caught as TaskSwitchError).stoppedExisting).toBe(false);
    expect(client.patch).toHaveBeenCalledWith("/api/timesheets/42/stop");
    expect(client.patch).toHaveBeenCalledWith("/api/timesheets/42/restart");
    expect(client.get).toHaveBeenCalledTimes(2);
  });

  it("does not restart when the server created the replacement but its response was lost", async () => {
    const running = new Map([[42, timesheet(42)]]);
    const client = mockClient({
      get: vi.fn(async () => [...running.values()]) as KimaiClient["get"],
      patch: vi.fn(async (path: string) => {
        if (path.endsWith("/stop")) running.delete(42);
        else running.set(42, timesheet(42));
        return timesheet(42);
      }) as KimaiClient["patch"],
      post: vi.fn(async () => {
        running.set(99, timesheet(99));
        throw new KimaiApiError(0, "Network Error", null, "network_error");
      }),
    });

    await expect(switchTask(client, {
      projectId: 1, activityId: 2, label: "Replacement",
    })).rejects.toMatchObject({ recoveryBlocked: true });

    expect([...running.keys()]).toEqual([99]);
    expect(client.get).toHaveBeenCalledTimes(2);
    expect(client.patch).toHaveBeenCalledTimes(1);
  });

  it.each([
    new KimaiApiError(0, "Network Error", null, "network_error"),
    new KimaiApiError(200, "Parse Error", null, "parse_error"),
    KimaiApiError.fromResponse(500, "Server Error", null),
    KimaiApiError.fromResponse(408, "Request Timeout", null),
    new Error("Unexpected transport failure"),
  ])("does not treat an empty snapshot as proof an ambiguous create failed: %s", async (error) => {
    const client = mockClient({ post: vi.fn().mockRejectedValue(error) });

    await expect(switchTask(client, {
      projectId: 1, activityId: 2, label: "Replacement",
    })).rejects.toMatchObject({ recoveryBlocked: true });

    expect(client.get).toHaveBeenCalledTimes(2);
    expect(client.patch).toHaveBeenCalledTimes(1);
  });

  it.each(["unavailable", "active"])("does not roll back a rejected create when verification is %s", async (state) => {
    const get = vi.fn().mockResolvedValueOnce([timesheet(42)]);
    if (state === "unavailable") get.mockRejectedValueOnce(new Error("offline"));
    else get.mockResolvedValueOnce([timesheet(100)]);
    const client = mockClient({ get });

    await expect(switchTask(client, {
      projectId: 1, activityId: 2, label: "Replacement",
    })).rejects.toMatchObject({ recoveryBlocked: true });

    expect(client.patch).toHaveBeenCalledTimes(1);
  });

  it("reports safe recovery being blocked without claiming the replacement failed to start", async () => {
    const client = mockClient({
      post: vi.fn().mockRejectedValue(new KimaiApiError(0, "Network Error", null, "network_error")),
      get: vi.fn().mockResolvedValueOnce([timesheet(42)]).mockRejectedValueOnce(new Error("offline")),
    });
    const queryClient = new QueryClient();
    const invalidate = vi.spyOn(queryClient, "invalidateQueries");
    const onStarted = vi.fn();
    const onFailed = vi.fn();
    const wrapper = ({ children }: PropsWithChildren) =>
      createElement(QueryClientProvider, { client: queryClient }, children);
    const { result } = renderHook(() => useStartTask(client, onStarted, onFailed), { wrapper });

    await act(async () => {
      expect(await result.current.startTask({ projectId: 1, activityId: 2, label: "Replacement" })).toBeNull();
    });

    expect(result.current.switchError).toContain("Check the current timer before trying again");
    expect(result.current.switchError).not.toContain("failed to start");
    expect(onStarted).not.toHaveBeenCalled();
    expect(onFailed).toHaveBeenCalledWith(expect.objectContaining({ recoveryBlocked: true }), expect.anything());
    expect(invalidate).toHaveBeenCalled();
    expect(client.patch).toHaveBeenCalledTimes(1);
    queryClient.clear();
  });

  it("reports a partial stop when rollback also fails", async () => {
    const patch = vi
      .fn()
      .mockResolvedValueOnce(timesheet(42))
      .mockRejectedValueOnce(new Error("restart failed"));
    const client = mockClient({ patch });

    await expect(
      switchTask(client, { projectId: 1, activityId: 2, label: "Replacement" }),
    ).rejects.toMatchObject({ stoppedExisting: true });
  });

  it("forwards a custom begin timestamp to the Kimai create request", async () => {
    const post = vi.fn(async () => timesheet(99));
    const client = mockClient({
      get: vi.fn(async () => []) as unknown as KimaiClient["get"],
      post: post as unknown as KimaiClient["post"],
    });
    const begin = "2026-07-11T07:30:00.000Z";

    await switchTask(client, {
      projectId: 1,
      activityId: 2,
      begin,
      label: "Backdated task",
    });

    expect(post).toHaveBeenCalledWith("/api/timesheets", {
      project: 1,
      activity: 2,
      begin,
      description: undefined,
      tags: undefined,
    });
  });

  it("stores issue_link metadata after Kimai returns the new timer id", async () => {
    const post = vi.fn(async () => timesheet(99));
    const patch = vi.fn(async () => timesheet(99));
    const client = mockClient({
      get: vi.fn(async () => []) as unknown as KimaiClient["get"],
      post: post as unknown as KimaiClient["post"],
      patch: patch as unknown as KimaiClient["patch"],
    });

    await switchTask(client, {
      projectId: 1,
      activityId: 2,
      metadata: { issue_link: " CREATIVE-123 " },
      label: "Issue task",
    });

    expect(patch).toHaveBeenCalledWith("/api/timesheets/99/meta", {
      name: "issue_link",
      value: "CREATIVE-123",
    });
    expect(post.mock.invocationCallOrder[0]).toBeLessThan(
      patch.mock.invocationCallOrder[0],
    );
  });

  it("does not restart the old timer when only the metadata request fails", async () => {
    const post = vi.fn(async () => timesheet(99));
    const patch = vi
      .fn()
      .mockResolvedValueOnce(timesheet(42))
      .mockRejectedValueOnce(new Error("metadata failed"));
    const client = mockClient({
      post: post as unknown as KimaiClient["post"],
      patch: patch as unknown as KimaiClient["patch"],
    });

    await expect(
      switchTask(client, {
        projectId: 1,
        activityId: 2,
        metadata: { issue_link: "CREATIVE-123" },
        label: "Issue task",
      }),
    ).rejects.toBeInstanceOf(TaskMetadataError);

    expect(patch).toHaveBeenNthCalledWith(1, "/api/timesheets/42/stop");
    expect(patch).toHaveBeenNthCalledWith(2, "/api/timesheets/99/meta", {
      name: "issue_link",
      value: "CREATIVE-123",
    });
    expect(patch).not.toHaveBeenCalledWith("/api/timesheets/42/restart");
  });

  it("publishes task metadata only after the create request succeeds", async () => {
    let resolveStart!: (entry: KimaiTimesheetEntry) => void;
    const post = vi.fn(
      () =>
        new Promise((resolve) => {
          resolveStart = resolve;
        }),
    );
    const client = mockClient({
      get: vi.fn(async () => []) as unknown as KimaiClient["get"],
      post: post as unknown as KimaiClient["post"],
    });
    const onStarted = vi.fn();
    const queryClient = new QueryClient();
    const wrapper = ({ children }: PropsWithChildren) =>
      createElement(QueryClientProvider, { client: queryClient }, children);
    const payload = { projectId: 1, activityId: 2, label: "New task" };
    const { result } = renderHook(
      () => useStartTask(client, onStarted),
      { wrapper },
    );

    let startPromise!: ReturnType<typeof result.current.startTask>;
    act(() => {
      startPromise = result.current.startTask(payload);
    });
    expect(onStarted).not.toHaveBeenCalled();
    await waitFor(() => expect(post).toHaveBeenCalledTimes(1));

    await act(async () => {
      resolveStart(timesheet(99));
      await startPromise;
    });
    await waitFor(() =>
      expect(onStarted).toHaveBeenCalledWith(timesheet(99), payload),
    );
    queryClient.clear();
  });

  it("shows a pending preview and publishes the created timer without waiting for a refetch", async () => {
    let resolveStart!: (entry: KimaiTimesheetEntry) => void;
    const post = vi.fn(() => new Promise((resolve) => { resolveStart = resolve; }));
    const client = {
      ...mockClient({
        get: vi.fn(async () => []) as unknown as KimaiClient["get"],
        post: post as unknown as KimaiClient["post"],
      }),
      cacheScope: "scope-a",
    } as KimaiClient;
    const queryClient = new QueryClient();
    const wrapper = ({ children }: PropsWithChildren) =>
      createElement(QueryClientProvider, { client: queryClient }, children);
    const preview = {
      project: "Alpha", activity: "Work", projectColor: "#111111", activityColor: "", customerColor: "",
    };
    const { result } = renderHook(() => useStartTask(client), { wrapper });

    let startPromise!: ReturnType<typeof result.current.startTask>;
    act(() => {
      startPromise = result.current.startTask({ projectId: 1, activityId: 2, label: "Alpha" }, "1-2", preview);
    });
    expect(result.current.pendingPreview).toEqual(preview);
    await waitFor(() => expect(post).toHaveBeenCalledTimes(1));

    await act(async () => {
      resolveStart(timesheet(99));
      await startPromise;
    });
    expect(result.current.pendingPreview).toBeNull();
    expect(result.current.handoffTimerId).toBe(99);
    expect(queryClient.getQueryData(["active-timesheets", "scope-a"])).toEqual([timesheet(99)]);

    post.mockImplementationOnce(async () => timesheet(100));
    await act(async () => {
      await result.current.startTask({ projectId: 1, activityId: 2, label: "Alpha" });
    });
    expect(result.current.handoffTimerId).toBe(99);
    queryClient.clear();
  });

  it("drops the pending preview when the start fails", async () => {
    const client = mockClient({ get: vi.fn(async () => []) as unknown as KimaiClient["get"] });
    const queryClient = new QueryClient();
    const wrapper = ({ children }: PropsWithChildren) =>
      createElement(QueryClientProvider, { client: queryClient }, children);
    const { result } = renderHook(() => useStartTask(client), { wrapper });

    await act(async () => {
      await result.current.startTask({ projectId: 1, activityId: 2, label: "Alpha" }, undefined, {
        project: "Alpha", activity: "Work", projectColor: "", activityColor: "", customerColor: "",
      });
    });
    expect(result.current.pendingPreview).toBeNull();
    expect(result.current.handoffTimerId).toBeNull();
    queryClient.clear();
  });

  it("publishes the running timer when only its metadata write fails", async () => {
    const client = mockClient({
      get: vi.fn(async () => []) as unknown as KimaiClient["get"],
      post: vi.fn(async () => timesheet(99)) as unknown as KimaiClient["post"],
      patch: vi.fn(async () => {
        throw new Error("metadata failed");
      }) as unknown as KimaiClient["patch"],
    });
    const onStarted = vi.fn();
    const onFailed = vi.fn();
    const queryClient = new QueryClient();
    const wrapper = ({ children }: PropsWithChildren) =>
      createElement(QueryClientProvider, { client: queryClient }, children);
    const payload = {
      projectId: 1,
      activityId: 2,
      metadata: { issue_link: "CREATIVE-123" },
      label: "New task",
    };
    const { result } = renderHook(
      () => useStartTask(client, onStarted, onFailed),
      { wrapper },
    );

    await act(async () => {
      expect(await result.current.startTask(payload)).toBeNull();
    });

    await waitFor(() =>
      expect(onStarted).toHaveBeenCalledWith(timesheet(99), payload),
    );
    expect(onFailed).not.toHaveBeenCalled();
    expect(result.current.switchError).toContain(
      "custom field data could not be saved",
    );
    queryClient.clear();
  });

  it("skips blank metadata names and values", async () => {
    const patch = vi.fn(async () => timesheet(99));
    const client = mockClient({
      get: vi.fn(async () => []) as unknown as KimaiClient["get"],
      post: vi.fn(async () => timesheet(99)) as unknown as KimaiClient["post"],
      patch: patch as unknown as KimaiClient["patch"],
    });
    await switchTask(client, { projectId: 1, activityId: 2, label: "Task", metadata: { "": "value", empty: "  ", valid: " yes " } });
    expect(patch).toHaveBeenCalledTimes(1);
    expect(patch).toHaveBeenCalledWith("/api/timesheets/99/meta", { name: "valid", value: "yes" });
  });

  it("reports partial and ordinary switch failures through the hook and dismisses them", async () => {
    const queryClient = new QueryClient();
    const wrapper = ({ children }: PropsWithChildren) => createElement(QueryClientProvider, { client: queryClient }, children);
    const patch = vi.fn().mockResolvedValueOnce(timesheet(42)).mockRejectedValueOnce(new Error("restart failed"));
    const onFailed = vi.fn();
    const { result, rerender } = renderHook(
      ({ currentClient }) => useStartTask(currentClient, undefined, onFailed),
      { initialProps: { currentClient: mockClient({ patch }) as KimaiClient | null }, wrapper },
    );
    const payload = { projectId: 1, activityId: 2, label: "Replacement" };
    await act(async () => expect(await result.current.startTask(payload, "key")).toBeNull());
    expect(result.current.switchError).toContain("Timer stopped");
    expect(onFailed).toHaveBeenCalled();
    act(() => result.current.dismissError());
    expect(result.current.switchError).toBeNull();

    rerender({ currentClient: null });
    await act(async () => expect(await result.current.startTask(payload)).toBeNull());
  });

  it("deduplicates starts while a mutation is pending", async () => {
    let resolveStart!: (entry: KimaiTimesheetEntry) => void;
    const post = vi.fn(() => new Promise<KimaiTimesheetEntry>((resolve) => { resolveStart = resolve; }));
    const client = mockClient({ get: vi.fn(async () => []) as unknown as KimaiClient["get"], post: post as unknown as KimaiClient["post"] });
    const queryClient = new QueryClient();
    const wrapper = ({ children }: PropsWithChildren) => createElement(QueryClientProvider, { client: queryClient }, children);
    const { result } = renderHook(() => useStartTask(client), { wrapper });
    const payload = { projectId: 1, activityId: 2, label: "Task" };
    let first!: Promise<KimaiTimesheetEntry | null>;
    act(() => { first = result.current.startTask(payload); });
    await waitFor(() => expect(result.current.isStarting).toBe(true));
    await act(async () => expect(await result.current.startTask(payload)).toBeNull());
    expect(post).toHaveBeenCalledTimes(1);
    await act(async () => resolveStart(timesheet(99)));
    await first;
  });

  it("reports an ordinary start failure through the hook", async () => {
    const currentClient = mockClient({ get: vi.fn(async () => []) as unknown as KimaiClient["get"] });
    const queryClient = new QueryClient();
    const wrapper = ({ children }: PropsWithChildren) => createElement(QueryClientProvider, { client: queryClient }, children);
    const { result } = renderHook(() => useStartTask(currentClient), { wrapper });
    await act(async () => expect(await result.current.startTask({ projectId: 1, activityId: 2, label: "Broken" })).toBeNull());
    expect(result.current.switchError).toContain('Failed to start "Broken"');
  });
});
