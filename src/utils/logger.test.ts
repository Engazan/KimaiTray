import { describe, expect, it } from "vitest";
import { redactLogMessage } from "./logger";

describe("log redaction", () => {
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
});
