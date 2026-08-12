import { describe, expect, it, vi } from "vitest";

vi.mock("./kimaiClient", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./kimaiClient")>();
  return {
    ...actual,
    createKimaiClient: () => ({
      get: vi.fn().mockRejectedValue("broken transport"),
    }),
  };
});

import { testConnection } from "./connectionService";

describe("Kimai connection verification fallback", () => {
  it("uses an unknown message for a non-Error failure", async () => {
    await expect(
      testConnection("https://kimai.test", "secret"),
    ).resolves.toMatchObject({
      success: false,
      error: "Unknown error",
      insecure: false,
    });
  });
});
