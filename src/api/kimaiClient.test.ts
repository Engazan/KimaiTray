// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ safeHttpFetch: vi.fn() }));
vi.mock("./safeHttp", () => ({ safeHttpFetch: mocks.safeHttpFetch }));
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
  beforeEach(() => vi.clearAllMocks());
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
    expect(isInsecureUrl("http://[::1]:8001")).toBe(false);
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

  it("accepts guarded responses and annotates parse errors", () => {
    expect(expectArrayResponse([1], "/array", (value): value is number => typeof value === "number")).toEqual([1]);
    expect(expectObjectResponse({ id: 1 }, "/object", "POST", (value): value is { id: number } =>
      typeof value === "object" && value !== null && "id" in value,
    )).toEqual({ id: 1 });
    try {
      expectObjectResponse(null, "/object", "PATCH");
    } catch (error) {
      expect(error).toMatchObject({ method: "PATCH", path: "/object", endpoint: "PATCH /object" });
    }
  });

  it("builds URLs without query values and exposes error details", () => {
    expect(buildApiUrl("https://kimai.test", "/api")).toBe("https://kimai.test/api");
    expect(buildApiUrl("https://kimai.test", "/api", { missing: undefined })).toBe("https://kimai.test/api");
    const auth = KimaiApiError.fromResponse(401, "Unauthorized", { message: "custom" });
    expect(auth.message).toBe("custom");
    expect(auth.isAuth).toBe(true);
    expect(auth.endpoint).toBeUndefined();
    expect(KimaiApiError.fromResponse(403, "Forbidden", null).isAuth).toBe(true);
    expect(KimaiApiError.fromResponse(500, "Error", null).message).toBe("Kimai server error");
    expect(KimaiApiError.fromResponse(418, "Teapot", null).message).toContain("HTTP 418");
  });

  it("executes every HTTP method and handles empty success responses", async () => {
    mocks.safeHttpFetch
      .mockResolvedValueOnce({ ok: true, status: 200, text: async () => '{"ok":true}' })
      .mockResolvedValueOnce({ ok: true, status: 204, text: async () => "" })
      .mockResolvedValueOnce({ ok: true, status: 200, text: async () => '{"patched":true}' })
      .mockResolvedValueOnce({ ok: true, status: 204, text: async () => "" })
      .mockResolvedValueOnce({ ok: true, status: 200, text: async () => "" });
    const client = createKimaiClient("https://kimai.test/", "token", "conn");
    await expect(client.get("/get", { active: true })).resolves.toEqual({ ok: true });
    await expect(client.post("/post", { value: 1 })).resolves.toBeUndefined();
    await expect(client.patch("/patch", { value: 2 })).resolves.toEqual({ patched: true });
    await expect(client.del("/delete")).resolves.toBeUndefined();
    await expect(client.get("/empty")).rejects.toMatchObject({ code: "parse_error", body: null });
    expect(mocks.safeHttpFetch).toHaveBeenNthCalledWith(2, "https://kimai.test/post", expect.objectContaining({ method: "POST", body: '{"value":1}' }));
  });

  it("aborts a request after the timeout", async () => {
    vi.useFakeTimers();
    mocks.safeHttpFetch.mockImplementation((_url, options) => new Promise((_resolve, reject) => {
      options.signal.addEventListener("abort", () => reject(new Error("aborted")));
    }));
    const client = createKimaiClient("https://kimai.test", "token");
    const pending = client.get("/slow");
    const assertion = expect(pending).rejects.toMatchObject({ code: "network_error" });
    await vi.advanceTimersByTimeAsync(30_000);
    await assertion;
    vi.useRealTimers();
  });

  it("turns HTTP, parse and network failures into endpoint-aware errors", async () => {
    const client = createKimaiClient("https://kimai.test", "token");
    mocks.safeHttpFetch.mockResolvedValueOnce({
      ok: false,
      status: 422,
      statusText: "Invalid",
      text: async () => '{"message":"bad input"}',
    });
    await expect(client.get("/bad")).rejects.toMatchObject({
      code: "validation_error", message: "bad input", endpoint: "GET /bad",
    });

    mocks.safeHttpFetch.mockResolvedValueOnce({ ok: true, status: 200, text: async () => "not-json" });
    await expect(client.get("/parse")).rejects.toMatchObject({ code: "parse_error", endpoint: "GET /parse" });

    mocks.safeHttpFetch.mockRejectedValueOnce(new Error("offline"));
    await expect(client.del("/network")).rejects.toMatchObject({ code: "network_error", endpoint: "DELETE /network" });
  });
});
