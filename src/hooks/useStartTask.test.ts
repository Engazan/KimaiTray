// @vitest-environment jsdom

import { createElement, type PropsWithChildren } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { KimaiClient } from "../api/kimaiClient";
import { switchTask, TaskSwitchError, useStartTask } from "./useStartTask";
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
    get: vi.fn(async () => [timesheet(42)]),
    post: vi.fn(async () => {
      throw new Error("start failed");
    }),
    patch: vi.fn(async () => timesheet(42)),
    del: vi.fn(async () => undefined),
    ...overrides,
  } as KimaiClient;
}

describe("transactional timer switching", () => {
  it("restarts a stopped timer when the replacement fails to start", async () => {
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
});
