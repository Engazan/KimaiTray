import { beforeEach, describe, expect, it, vi } from "vitest";

const http = vi.hoisted(() => ({ safeHttpFetch: vi.fn() }));

vi.mock("../api/safeHttp", () => http);

import { fetchRemoteCategoryConfig } from "./categoryRemoteSource";

describe("remote category configuration", () => {
  beforeEach(() => vi.resetAllMocks());

  it("accepts and normalizes a valid remote configuration", async () => {
    http.safeHttpFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        continueWindowMinutes: 20,
        categories: [
          {
            id: "support",
            label: "Support",
            children: [
              {
                id: "triage",
                label: "Triage",
                activityName: "Support",
                requiresProject: true,
                tags: ["helpdesk", 42],
              },
            ],
          },
        ],
      }),
    });

    await expect(
      fetchRemoteCategoryConfig(
        "https://config.example.test/categories.json",
        "connection-a",
      ),
    ).resolves.toEqual({
      continueWindowMinutes: 20,
      categories: [
        {
          id: "support",
          label: "Support",
          children: [
            {
              id: "triage",
              label: "Triage",
              activityName: "Support",
              requiresProject: true,
              tags: ["helpdesk"],
            },
          ],
        },
      ],
    });
    expect(http.safeHttpFetch).toHaveBeenCalledWith(
      "https://config.example.test/categories.json",
      expect.objectContaining({
        authorization: { type: "category", connectionId: "connection-a" },
      }),
    );
  });

  it("preserves the existing configuration on network or shape failure", async () => {
    http.safeHttpFetch.mockRejectedValueOnce(new Error("offline"));
    await expect(
      fetchRemoteCategoryConfig("https://config.example.test/categories.json"),
    ).resolves.toBeNull();

    http.safeHttpFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ categories: "invalid" }),
    });
    await expect(
      fetchRemoteCategoryConfig("https://config.example.test/categories.json"),
    ).resolves.toBeNull();
  });
});
