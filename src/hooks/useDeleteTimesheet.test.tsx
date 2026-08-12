// @vitest-environment jsdom

import type { PropsWithChildren } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { KimaiClient } from "../api/kimaiClient";

const mocks = vi.hoisted(() => ({
  deleteTimesheet: vi.fn(),
  invalidateTimesheets: vi.fn(),
}));

vi.mock("../api/timesheetApi", () => ({
  deleteTimesheet: mocks.deleteTimesheet,
}));
vi.mock("./invalidateTimesheets", () => ({
  invalidateTimesheets: mocks.invalidateTimesheets,
}));

import { useDeleteTimesheet } from "./useDeleteTimesheet";

const client = { cacheScope: "connection-a:1" } as KimaiClient;

function setup() {
  const queryClient = new QueryClient({
    defaultOptions: { mutations: { retry: false } },
  });
  const wrapper = ({ children }: PropsWithChildren) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  return { queryClient, wrapper };
}

describe("timesheet deletion", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.deleteTimesheet.mockResolvedValue(undefined);
  });

  it("does nothing without an active client", () => {
    const { wrapper } = setup();
    const { result } = renderHook(() => useDeleteTimesheet(null), { wrapper });

    act(() => result.current.deleteEntry(42));

    expect(mocks.deleteTimesheet).not.toHaveBeenCalled();
  });

  it("tracks the deleting id and invalidates timesheets after success", async () => {
    let finish: (() => void) | undefined;
    mocks.deleteTimesheet.mockImplementation(
      () => new Promise<void>((resolve) => { finish = resolve; }),
    );
    const { queryClient, wrapper } = setup();
    const { result } = renderHook(() => useDeleteTimesheet(client), { wrapper });

    act(() => result.current.deleteEntry(42));
    await waitFor(() => expect(result.current.deletingId).toBe(42));
    expect(result.current.isDeleting).toBe(true);

    act(() => finish?.());
    await waitFor(() => expect(result.current.isDeleting).toBe(false));
    expect(result.current.deletingId).toBeNull();
    expect(mocks.deleteTimesheet).toHaveBeenCalledWith(client, 42);
    expect(mocks.invalidateTimesheets).toHaveBeenCalledWith(queryClient);
  });

  it("blocks duplicate requests while deletion is pending", async () => {
    mocks.deleteTimesheet.mockReturnValue(new Promise(() => {}));
    const { wrapper } = setup();
    const { result } = renderHook(() => useDeleteTimesheet(client), { wrapper });

    act(() => {
      result.current.deleteEntry(1);
    });
    await waitFor(() => expect(result.current.isDeleting).toBe(true));
    act(() => result.current.deleteEntry(2));

    expect(mocks.deleteTimesheet).toHaveBeenCalledOnce();
  });

  it("exposes and dismisses deletion failures", async () => {
    mocks.deleteTimesheet.mockRejectedValue(new Error("Cannot delete exported entry"));
    const { wrapper } = setup();
    const { result } = renderHook(() => useDeleteTimesheet(client), { wrapper });

    act(() => result.current.deleteEntry(42));
    await waitFor(() =>
      expect(result.current.deleteError).toBe("Cannot delete exported entry"),
    );
    expect(result.current.deletingId).toBeNull();

    act(() => result.current.dismissError());
    expect(result.current.deleteError).toBeNull();
  });
});
