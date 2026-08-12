// @vitest-environment jsdom

import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { FavoriteTask } from "../types";

const store = vi.hoisted(() => ({
  loadFavorites: vi.fn(),
  addFavorite: vi.fn(),
  removeFavorite: vi.fn(),
}));

vi.mock("../api/favoritesStore", () => store);

import { useFavorites } from "./useFavorites";

const task: FavoriteTask = {
  key: "1:2",
  projectId: 1,
  activityId: 2,
  project: "Project",
  activity: "Activity",
  customer: "Customer",
  description: "",
  tags: [],
  projectColor: "",
  activityColor: "",
  customerColor: "",
};

describe("favorite task state", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    store.loadFavorites.mockResolvedValue([]);
    store.addFavorite.mockResolvedValue([]);
    store.removeFavorite.mockResolvedValue([]);
  });

  it("loads and queries favorites in the current connection scope", async () => {
    store.loadFavorites.mockResolvedValue([{ ...task, connectionId: "connection-a" }]);
    const { result } = renderHook(() =>
      useFavorites("connection-a", "https://kimai.test"),
    );

    await waitFor(() => expect(result.current.favorites).toHaveLength(1));
    expect(store.loadFavorites).toHaveBeenCalledWith(
      "connection-a",
      "https://kimai.test",
    );
    expect(result.current.isFavorite(task.key)).toBe(true);
    expect(result.current.isFavorite("missing")).toBe(false);
  });

  it("injects the active identity before adding a favorite", async () => {
    const saved = {
      ...task,
      connectionId: "connection-a",
      baseUrl: "https://kimai.test",
    };
    store.addFavorite.mockResolvedValue([saved]);
    const { result } = renderHook(() =>
      useFavorites("connection-a", "https://kimai.test"),
    );

    await act(async () => result.current.addFavorite(task));

    expect(store.addFavorite).toHaveBeenCalledWith(saved);
    expect(result.current.favorites).toEqual([saved]);
  });

  it("removes from the current scope and adopts the committed list", async () => {
    store.removeFavorite.mockResolvedValue([{ ...task, key: "remaining" }]);
    const { result } = renderHook(() =>
      useFavorites("connection-a", "https://kimai.test"),
    );

    await act(async () => result.current.removeFavorite(task.key));

    expect(store.removeFavorite).toHaveBeenCalledWith(
      task.key,
      "connection-a",
      "https://kimai.test",
    );
    expect(result.current.favorites[0].key).toBe("remaining");
  });

  it("clears state and blocks mutations without a connection", async () => {
    const { result, rerender } = renderHook(
      ({ connectionId }) => useFavorites(connectionId, "https://kimai.test"),
      { initialProps: { connectionId: "connection-a" } },
    );
    await waitFor(() => expect(store.loadFavorites).toHaveBeenCalledOnce());

    rerender({ connectionId: "" });
    await act(async () => {
      await result.current.addFavorite(task);
      await result.current.removeFavorite(task.key);
    });

    expect(result.current.favorites).toEqual([]);
    expect(store.addFavorite).not.toHaveBeenCalled();
    expect(store.removeFavorite).not.toHaveBeenCalled();
  });

  it("ignores an obsolete load after switching connections", async () => {
    let resolveFirst: ((items: FavoriteTask[]) => void) | undefined;
    store.loadFavorites
      .mockImplementationOnce(
        () => new Promise<FavoriteTask[]>((resolve) => { resolveFirst = resolve; }),
      )
      .mockResolvedValueOnce([{ ...task, key: "new", connectionId: "connection-b" }]);
    const { result, rerender } = renderHook(
      ({ connectionId }) => useFavorites(connectionId, "https://kimai.test"),
      { initialProps: { connectionId: "connection-a" } },
    );

    rerender({ connectionId: "connection-b" });
    await waitFor(() => expect(result.current.favorites[0]?.key).toBe("new"));
    await act(async () => resolveFirst?.([{ ...task, key: "old" }]));

    expect(result.current.favorites[0].key).toBe("new");
  });
});
