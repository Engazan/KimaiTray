// @vitest-environment jsdom

import { createElement, type PropsWithChildren } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { KimaiClient } from "../api/kimaiClient";
import { switchTask, TaskSwitchError, useStartTask } from "./useStartTask";

function mockClient(overrides: Partial<KimaiClient> = {}): KimaiClient {
  return {
    baseUrl: "https://kimai.example.test",
    connectionId: "connection-a",
    get: vi.fn(async () => [{ id: 42 }]),
    post: vi.fn(async () => {
      throw new Error("start failed");
    }),
    patch: vi.fn(async () => ({ id: 42 })),
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
      .mockResolvedValueOnce({ id: 42 })
      .mockRejectedValueOnce(new Error("restart failed"));
    const client = mockClient({ patch });

    await expect(
      switchTask(client, { projectId: 1, activityId: 2, label: "Replacement" }),
    ).rejects.toMatchObject({ stoppedExisting: true });
  });

  it("forwards a custom begin timestamp to the Kimai create request", async () => {
    const post = vi.fn(async () => ({ id: 99 }));
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
    let resolveStart!: (entry: { id: number }) => void;
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

    await act(async () => result.current.startTask(payload));
    expect(onStarted).not.toHaveBeenCalled();
    await waitFor(() => expect(post).toHaveBeenCalledTimes(1));

    await act(async () => resolveStart({ id: 99 }));
    await waitFor(() =>
      expect(onStarted).toHaveBeenCalledWith({ id: 99 }, payload),
    );
    queryClient.clear();
  });
});
