// @vitest-environment jsdom

import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { KimaiClient } from "../api/kimaiClient";

const mocks = vi.hoisted(() => ({
  useQuery: vi.fn(),
  getActiveEntriesLimit: vi.fn(),
}));

vi.mock("@tanstack/react-query", () => ({ useQuery: mocks.useQuery }));
vi.mock("../api/timesheetApi", () => ({ getActiveEntriesLimit: mocks.getActiveEntriesLimit }));

import { useActiveEntriesLimit } from "./useActiveEntriesLimit";

const client = { cacheScope: "connection-a:1" } as KimaiClient;

describe("active entries limit query", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.useQuery.mockReturnValue({ data: undefined });
  });

  it("allows a single timer until the limit is known", () => {
    const { result } = renderHook(() => useActiveEntriesLimit(null));

    expect(result.current).toBe(1);
    expect(mocks.useQuery).toHaveBeenCalledWith(
      expect.objectContaining({ queryKey: ["timesheet-config", undefined], enabled: false }),
    );
  });

  it("returns the instance limit from a connection-scoped fetch", async () => {
    mocks.useQuery.mockReturnValue({ data: 3 });
    mocks.getActiveEntriesLimit.mockResolvedValue(3);

    const { result } = renderHook(() => useActiveEntriesLimit(client));

    expect(result.current).toBe(3);
    const options = mocks.useQuery.mock.calls[0][0];
    expect(options).toMatchObject({ queryKey: ["timesheet-config", "connection-a:1"], enabled: true });
    await expect(options.queryFn()).resolves.toBe(3);
    expect(mocks.getActiveEntriesLimit).toHaveBeenCalledWith(client);
  });
});
