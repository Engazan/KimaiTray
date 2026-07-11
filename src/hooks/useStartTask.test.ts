import { describe, expect, it, vi } from "vitest";
import type { KimaiClient } from "../api/kimaiClient";
import { switchTask, TaskSwitchError } from "./useStartTask";

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
});
