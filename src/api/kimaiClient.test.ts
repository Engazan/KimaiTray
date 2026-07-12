import { describe, expect, it } from "vitest";
import {
  buildApiUrl,
  createKimaiClient,
  expectArrayResponse,
  expectObjectResponse,
  isInsecureUrl,
  KimaiApiError,
  normalizeBaseUrl,
} from "./kimaiClient";

describe("Kimai URL helpers", () => {
  it("normalizes trailing slashes without changing the origin", () => {
    expect(normalizeBaseUrl(" https://kimai.example.test/// ")).toBe(
      "https://kimai.example.test",
    );
  });

  it("encodes query parameters and omits nullish values", () => {
    expect(
      buildApiUrl("https://kimai.example.test", "/api/timesheets", {
        search: "a & b",
        page: 2,
        ignored: null,
      }),
    ).toBe(
      "https://kimai.example.test/api/timesheets?search=a+%26+b&page=2",
    );
  });

  it("allows insecure HTTP only for loopback hosts", () => {
    expect(isInsecureUrl("http://kimai.example.test")).toBe(true);
    expect(isInsecureUrl("http://localhost:8001")).toBe(false);
    expect(isInsecureUrl("http://127.0.0.1:8001")).toBe(false);
    expect(isInsecureUrl("https://kimai.example.test")).toBe(false);
    expect(isInsecureUrl("not a URL")).toBe(true);
  });

  it("keeps cache identity separate from credentials", () => {
    const client = createKimaiClient(
      "https://kimai.example.test",
      "secret-token",
      "connection-a",
    );

    expect(client.connectionId).toBe("connection-a");
    expect(client.cacheScope).toContain("connection-a:");
    expect(client.cacheScope).not.toContain("secret-token");
  });

  it("rotates automatic cache identity only when the session changes", () => {
    const first = createKimaiClient(
      "https://scope.example.test",
      "token-a",
      "scoped-connection",
    );
    const sameSession = createKimaiClient(
      "https://scope.example.test/",
      "token-a",
      "scoped-connection",
    );
    const rotated = createKimaiClient(
      "https://scope.example.test",
      "token-b",
      "scoped-connection",
    );

    expect(sameSession.cacheScope).toBe(first.cacheScope);
    expect(rotated.cacheScope).not.toBe(first.cacheScope);
    expect(rotated.cacheScope).not.toContain("token-b");
  });

  it("rejects malformed array responses at the API boundary", () => {
    expect(() => expectArrayResponse({}, "/api/timesheets")).toThrow(
      KimaiApiError,
    );
  });

  it("rejects malformed object responses at the API boundary", () => {
    expect(() => expectObjectResponse([], "/api/users/me")).toThrow(
      KimaiApiError,
    );
  });
});
