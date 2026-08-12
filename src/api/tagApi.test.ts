import { beforeEach, describe, expect, it, vi } from "vitest";
import type { KimaiClient } from "./kimaiClient";
import { getTags } from "./tagApi";

describe("Kimai tag API compatibility", () => {
  let get: ReturnType<typeof vi.fn>;
  let client: KimaiClient;

  beforeEach(() => {
    get = vi.fn();
    client = { get } as unknown as KimaiClient;
  });

  it("prefers rich tag entities and preserves their colors", async () => {
    get.mockResolvedValue([
      { name: "support", color: "#123456" },
      { name: "no-color", color: null },
      { name: "", color: "#ffffff" },
      null,
    ]);

    await expect(getTags(client)).resolves.toEqual([
      { name: "support", color: "#123456" },
      { name: "no-color", color: null },
    ]);
    expect(get).toHaveBeenCalledOnce();
    expect(get).toHaveBeenCalledWith("/api/tags/find", { name: "" });
  });

  it("falls back to legacy names when the rich endpoint fails", async () => {
    get.mockRejectedValueOnce(new Error("not found")).mockResolvedValueOnce([
      "support",
      { name: "urgent" },
      { wrong: "shape" },
    ]);

    await expect(getTags(client)).resolves.toEqual([
      { name: "support", color: null },
      { name: "urgent", color: null },
    ]);
    expect(get).toHaveBeenNthCalledWith(2, "/api/tags");
  });

  it("falls back when the rich endpoint contains no usable tags", async () => {
    get.mockResolvedValueOnce([{ name: 123 }, null]).mockResolvedValueOnce([
      "legacy",
    ]);

    await expect(getTags(client)).resolves.toEqual([
      { name: "legacy", color: null },
    ]);
  });

  it("returns an empty list for a malformed legacy response", async () => {
    get.mockResolvedValueOnce(null).mockResolvedValueOnce({ tags: [] });

    await expect(getTags(client)).resolves.toEqual([]);
  });
});
