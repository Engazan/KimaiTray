import { beforeEach, describe, expect, it, vi } from "vitest";

const core = vi.hoisted(() => ({ invoke: vi.fn() }));
vi.mock("@tauri-apps/api/core", () => core);

import { deleteApiToken, getApiToken, saveApiToken } from "./secureStore";

describe("native credential store adapter", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("saves, reads and deletes a credential through native commands", async () => {
    core.invoke.mockResolvedValueOnce(undefined).mockResolvedValueOnce("secret");

    await expect(saveApiToken("scope-a", "secret")).resolves.toBeUndefined();
    await expect(getApiToken("scope-a")).resolves.toBe("secret");
    await expect(deleteApiToken("scope-a")).resolves.toBeUndefined();

    expect(core.invoke).toHaveBeenNthCalledWith(1, "save_api_token", {
      baseUrl: "scope-a",
      token: "secret",
    });
    expect(core.invoke).toHaveBeenNthCalledWith(2, "get_api_token", {
      baseUrl: "scope-a",
    });
    expect(core.invoke).toHaveBeenNthCalledWith(3, "delete_api_token", {
      baseUrl: "scope-a",
    });
  });

  it("does not invoke native storage for incomplete keys or secrets", async () => {
    await saveApiToken("", "secret");
    await saveApiToken("scope-a", "");
    await expect(getApiToken("")).resolves.toBeNull();
    await deleteApiToken("");

    expect(core.invoke).not.toHaveBeenCalled();
  });

  it("propagates native failures to callers", async () => {
    core.invoke.mockRejectedValue(new Error("keychain unavailable"));

    await expect(getApiToken("scope-a")).rejects.toThrow(
      "keychain unavailable",
    );
  });
});
