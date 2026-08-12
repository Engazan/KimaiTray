// @vitest-environment jsdom

import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { KimaiClient } from "../api/kimaiClient";

const mocks = vi.hoisted(() => ({
  useQuery: vi.fn(),
  getTags: vi.fn(),
}));

vi.mock("@tanstack/react-query", () => ({ useQuery: mocks.useQuery }));
vi.mock("../api/tagApi", () => ({ getTags: mocks.getTags }));

import { useKimaiTags } from "./useKimaiTags";

const client = { cacheScope: "connection-a:1" } as KimaiClient;

describe("Kimai tag query", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.useQuery.mockReturnValue({ data: undefined });
  });

  it("returns an empty list and disables querying without a client", () => {
    const { result } = renderHook(() => useKimaiTags(null));

    expect(result.current).toEqual([]);
    expect(mocks.useQuery).toHaveBeenCalledWith(
      expect.objectContaining({
        queryKey: ["tags", undefined],
        enabled: false,
        staleTime: 300_000,
      }),
    );
  });

  it("returns cached tags and configures a connection-scoped fetch", async () => {
    const tags = [{ name: "support", color: "#10b981" }];
    mocks.useQuery.mockReturnValue({ data: tags });
    const { result } = renderHook(() => useKimaiTags(client));
    const options = mocks.useQuery.mock.calls[0][0];

    expect(result.current).toBe(tags);
    expect(options.queryKey).toEqual(["tags", "connection-a:1"]);
    expect(options.enabled).toBe(true);
    mocks.getTags.mockResolvedValue(tags);
    await expect(options.queryFn()).resolves.toEqual(tags);
    expect(mocks.getTags).toHaveBeenCalledWith(client);
  });
});
