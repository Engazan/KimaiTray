import { beforeEach, describe, expect, it, vi } from "vitest";

const secureStore = vi.hoisted(() => ({
  saveApiToken: vi.fn<(key: string, token: string) => Promise<void>>(),
  getApiToken: vi.fn<(key: string) => Promise<string | null>>(),
  deleteApiToken: vi.fn<(key: string) => Promise<void>>(),
}));

vi.mock("../../api/secureStore", () => secureStore);

import {
  deleteIssueToken,
  getIssueToken,
  saveIssueToken,
} from "./issueTokenStore";

describe("issue integration token storage", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    secureStore.saveApiToken.mockResolvedValue();
    secureStore.getApiToken.mockResolvedValue("stored-token");
    secureStore.deleteApiToken.mockResolvedValue();
  });

  it("isolates credentials by Kimai connection id", async () => {
    await saveIssueToken("connection-a", "token-a");
    await expect(getIssueToken("connection-b")).resolves.toBe("stored-token");
    await deleteIssueToken("connection-c");

    expect(secureStore.saveApiToken).toHaveBeenCalledWith(
      "issue-token:connection-a",
      "token-a",
    );
    expect(secureStore.getApiToken).toHaveBeenCalledWith(
      "issue-token:connection-b",
    );
    expect(secureStore.deleteApiToken).toHaveBeenCalledWith(
      "issue-token:connection-c",
    );
  });

  it("never creates a shared credential for an empty connection id", async () => {
    await saveIssueToken("", "token");
    await expect(getIssueToken("")).resolves.toBeNull();
    await deleteIssueToken("");

    expect(secureStore.saveApiToken).not.toHaveBeenCalled();
    expect(secureStore.getApiToken).not.toHaveBeenCalled();
    expect(secureStore.deleteApiToken).not.toHaveBeenCalled();
  });

  it("does not persist an empty token", async () => {
    await saveIssueToken("connection-a", "");

    expect(secureStore.saveApiToken).not.toHaveBeenCalled();
  });
});
