import { beforeEach, describe, expect, it, vi } from "vitest";

const secureStore = vi.hoisted(() => ({
  saveApiToken: vi.fn<(key: string, token: string) => Promise<void>>(),
  getApiToken: vi.fn<(key: string) => Promise<string | null>>(),
  deleteApiToken: vi.fn<(key: string) => Promise<void>>(),
}));

vi.mock("./secureStore", () => secureStore);

import {
  deleteConnectionToken,
  getConnectionToken,
  saveConnectionToken,
} from "./connectionTokenStore";

describe("connection token storage", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    secureStore.saveApiToken.mockResolvedValue();
    secureStore.deleteApiToken.mockResolvedValue();
  });

  it("namespaces credentials by connection id", async () => {
    await saveConnectionToken("connection-a", "secret-a");
    await deleteConnectionToken("connection-b");

    expect(secureStore.saveApiToken).toHaveBeenCalledWith(
      "conn-token:connection-a",
      "secret-a",
    );
    expect(secureStore.deleteApiToken).toHaveBeenCalledWith(
      "conn-token:connection-b",
    );
  });

  it("returns an id-scoped token without reading the legacy URL", async () => {
    secureStore.getApiToken.mockResolvedValueOnce("current-token");

    await expect(
      getConnectionToken("connection-a", "https://kimai.example.test"),
    ).resolves.toBe("current-token");
    expect(secureStore.getApiToken).toHaveBeenCalledTimes(1);
    expect(secureStore.getApiToken).toHaveBeenCalledWith(
      "conn-token:connection-a",
    );
    expect(secureStore.saveApiToken).not.toHaveBeenCalled();
  });

  it("migrates a legacy URL token to the connection-scoped key", async () => {
    secureStore.getApiToken
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce("legacy-token");

    await expect(
      getConnectionToken("connection-a", "https://kimai.example.test"),
    ).resolves.toBe("legacy-token");
    expect(secureStore.getApiToken).toHaveBeenNthCalledWith(
      1,
      "conn-token:connection-a",
    );
    expect(secureStore.getApiToken).toHaveBeenNthCalledWith(
      2,
      "https://kimai.example.test",
    );
    expect(secureStore.saveApiToken).toHaveBeenCalledWith(
      "conn-token:connection-a",
      "legacy-token",
    );
  });

  it("does not create empty credential keys", async () => {
    await saveConnectionToken("", "secret");
    await deleteConnectionToken("");

    expect(secureStore.saveApiToken).not.toHaveBeenCalled();
    expect(secureStore.deleteApiToken).not.toHaveBeenCalled();
  });
});
