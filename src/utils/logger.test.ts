import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }));
vi.mock("@tauri-apps/plugin-log", () => ({ ...mocks, default: mocks }));

import { logger, redactLogMessage } from "./logger";

describe("log redaction", () => {
  beforeEach(() => vi.clearAllMocks());
  it("redacts bearer tokens, token fields and URL credentials", () => {
    const message =
      "Authorization: Bearer secret-123 token=abc https://alice:password@example.test/api";

    const redacted = redactLogMessage(message);
    expect(redacted).not.toContain("secret-123");
    expect(redacted).not.toContain("token=abc");
    expect(redacted).not.toContain("alice:password");
    expect(redacted).toContain("[REDACTED]");
  });

  it("redacts supported token field spellings without changing safe text", () => {
    expect(
      redactLogMessage(
        "private-token: first api_token=second api-token:third token = fourth safe=value",
      ),
    ).toBe(
      "private-token: [REDACTED] api_token=[REDACTED] api-token:[REDACTED] token = [REDACTED] safe=value",
    );
    expect(redactLogMessage("Request finished successfully")).toBe(
      "Request finished successfully",
    );
  });

  it("routes enabled levels to the native logger and skips debug by default", async () => {
    const consoleInfo = vi.spyOn(console, "info").mockImplementation(() => {});
    const consoleWarn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    logger.debug("debug secret");
    logger.info("info token=secret");
    logger.warn("warning");
    logger.error("failure");
    await vi.waitFor(() => expect(consoleError).toHaveBeenCalledWith("failure"));
    expect(mocks.debug).not.toHaveBeenCalled();
    consoleInfo.mockRestore();
    consoleWarn.mockRestore();
    consoleError.mockRestore();
  });

  it("falls back to the matching console method when native logging fails", async () => {
    mocks.error.mockRejectedValueOnce(new Error("native logger"));
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    logger.error("Bearer private");
    await vi.waitFor(() => expect(consoleError).toHaveBeenCalledWith("Bearer [REDACTED]"));
    consoleError.mockRestore();
  });
});
