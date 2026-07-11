import { describe, expect, it } from "vitest";
import {
  buildApiUrl,
  expectArrayResponse,
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

  it("rejects malformed array responses at the API boundary", () => {
    expect(() => expectArrayResponse({}, "/api/timesheets")).toThrow(
      KimaiApiError,
    );
  });
});
