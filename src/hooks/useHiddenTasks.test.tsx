// @vitest-environment jsdom

import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const store = vi.hoisted(() => ({
  loadHiddenTasks: vi.fn(),
  addHiddenTask: vi.fn(),
  removeHiddenTask: vi.fn(),
  clearHiddenTasks: vi.fn(),
}));

vi.mock("../api/hiddenTasksStore", () => store);

import { useHiddenTasks } from "./useHiddenTasks";

describe("hidden recent-task state", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    store.loadHiddenTasks.mockResolvedValue([]);
    store.addHiddenTask.mockResolvedValue([]);
    store.removeHiddenTask.mockResolvedValue([]);
    store.clearHiddenTasks.mockResolvedValue(undefined);
  });

  it("loads the current connection into a Set", async () => {
    store.loadHiddenTasks.mockResolvedValue(["task-a", "task-b"]);
    const { result } = renderHook(() => useHiddenTasks("connection-a"));

    await waitFor(() => expect(result.current.hiddenKeys.size).toBe(2));
    expect(result.current.hiddenKeys.has("task-a")).toBe(true);
    expect(store.loadHiddenTasks).toHaveBeenCalledWith("connection-a");
  });

  it("adopts atomic add and remove results", async () => {
    store.addHiddenTask.mockResolvedValue(["task-a"]);
    store.removeHiddenTask.mockResolvedValue([]);
    const { result } = renderHook(() => useHiddenTasks("connection-a"));

    await act(async () => result.current.hideTask("task-a"));
    expect(result.current.hiddenKeys.has("task-a")).toBe(true);
    expect(store.addHiddenTask).toHaveBeenCalledWith("connection-a", "task-a");

    await act(async () => result.current.unhideTask("task-a"));
    expect(result.current.hiddenKeys.size).toBe(0);
    expect(store.removeHiddenTask).toHaveBeenCalledWith("connection-a", "task-a");
  });

  it("clears native and local state together", async () => {
    store.loadHiddenTasks.mockResolvedValue(["task-a"]);
    const { result } = renderHook(() => useHiddenTasks("connection-a"));
    await waitFor(() => expect(result.current.hiddenKeys.size).toBe(1));

    await act(async () => result.current.clearAll());

    expect(store.clearHiddenTasks).toHaveBeenCalledWith("connection-a");
    expect(result.current.hiddenKeys.size).toBe(0);
  });

  it("clears state and blocks mutations without a connection", async () => {
    const { result, rerender } = renderHook(
      ({ connectionId }) => useHiddenTasks(connectionId),
      { initialProps: { connectionId: "connection-a" } },
    );
    await waitFor(() => expect(store.loadHiddenTasks).toHaveBeenCalledOnce());

    rerender({ connectionId: "" });
    await act(async () => {
      await result.current.hideTask("task-a");
      await result.current.unhideTask("task-a");
      await result.current.clearAll();
    });

    expect(result.current.hiddenKeys.size).toBe(0);
    expect(store.addHiddenTask).not.toHaveBeenCalled();
    expect(store.removeHiddenTask).not.toHaveBeenCalled();
    expect(store.clearHiddenTasks).not.toHaveBeenCalled();
  });

  it("ignores an obsolete load after switching connections", async () => {
    let resolveFirst: ((keys: string[]) => void) | undefined;
    store.loadHiddenTasks
      .mockImplementationOnce(
        () => new Promise<string[]>((resolve) => { resolveFirst = resolve; }),
      )
      .mockResolvedValueOnce(["new"]);
    const { result, rerender } = renderHook(
      ({ connectionId }) => useHiddenTasks(connectionId),
      { initialProps: { connectionId: "connection-a" } },
    );

    rerender({ connectionId: "connection-b" });
    await waitFor(() => expect(result.current.hiddenKeys.has("new")).toBe(true));
    await act(async () => resolveFirst?.(["old"]));

    expect(result.current.hiddenKeys.has("new")).toBe(true);
    expect(result.current.hiddenKeys.has("old")).toBe(false);
  });
});
