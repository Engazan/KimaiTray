// @vitest-environment jsdom

import { act, renderHook } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { KimaiApiError, type KimaiClient } from "../api/kimaiClient";
import type { KimaiTimesheetEntry } from "../api/kimaiTypes";
import { useEditTimesheet } from "./useEditTimesheet";

function response(): KimaiTimesheetEntry {
  return {
    id: 42,
    begin: "2026-07-22T09:00:00+0200",
    end: "2026-07-22T11:00:00+0200",
    duration: 7_200,
    description: "",
    rate: 0,
    internalRate: 0,
    exported: false,
    billable: true,
    tags: [],
    activity: 2,
    project: 1,
    user: 3,
  };
}

function setup(patch: ReturnType<typeof vi.fn>) {
  const queryClient = new QueryClient({
    defaultOptions: { mutations: { retry: false } },
  });
  const invalidate = vi.spyOn(queryClient, "invalidateQueries");
  const client = { patch } as unknown as KimaiClient;
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  const hook = renderHook(() => useEditTimesheet(client), { wrapper });
  return { ...hook, invalidate };
}

describe("useEditTimesheet", () => {
  it("propagates permission failures without invalidating cached entries", async () => {
    const forbidden = new KimaiApiError(403, "Forbidden", null, "forbidden");
    const patch = vi.fn().mockRejectedValue(forbidden);
    const { result, invalidate } = setup(patch);

    await act(async () => {
      await expect(
        result.current.editTimesheet(42, { end: "2026-07-22T11:00:00" }),
      ).rejects.toBe(forbidden);
    });

    expect(invalidate).not.toHaveBeenCalled();
  });

  it("invalidates timesheet queries after a successful PATCH", async () => {
    const patch = vi.fn().mockResolvedValue(response());
    const { result, invalidate } = setup(patch);

    await act(async () => {
      await result.current.editTimesheet(42, {
        end: "2026-07-22T11:00:00",
      });
    });

    expect(patch).toHaveBeenCalledWith("/api/timesheets/42", {
      end: "2026-07-22T11:00:00",
    });
    expect(invalidate).toHaveBeenCalledOnce();
  });
});
