// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  safeHttpFetch: vi.fn(),
  translate: vi.fn((key: string) => `translated:${key}`),
}));

vi.mock("./safeHttp", () => ({ safeHttpFetch: mocks.safeHttpFetch }));
vi.mock("../shared/i18n", () => ({
  default: { t: mocks.translate },
}));

import {
  getCurrentUser,
  getTimesheetCustomFieldDefinitions,
  getVersion,
  testConnection,
} from "./connectionService";
import type { KimaiClient } from "./kimaiClient";

const user = { id: 1, username: "tester", alias: null };
const version = { version: "2.30.0" };

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    statusText: status === 200 ? "OK" : "Unauthorized",
    headers: { "content-type": "application/json" },
  });
}

describe("Kimai connection verification", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.translate.mockImplementation((key: string) => `translated:${key}`);
  });

  it("validates the current user and version API entities", async () => {
    const client = {
      get: vi.fn().mockResolvedValueOnce(user).mockResolvedValueOnce(version),
    } as unknown as KimaiClient;

    await expect(getCurrentUser(client)).resolves.toEqual(user);
    await expect(getVersion(client)).resolves.toEqual(version);
    expect(client.get).toHaveBeenNthCalledWith(1, "/api/users/me");
    expect(client.get).toHaveBeenNthCalledWith(2, "/api/version");
  });

  it("rejects malformed current-user and version responses", async () => {
    const client = {
      get: vi.fn().mockResolvedValue({ id: "invalid" }),
    } as unknown as KimaiClient;

    await expect(getCurrentUser(client)).rejects.toThrow(
      "Failed to parse server response",
    );
    await expect(getVersion(client)).rejects.toThrow(
      "Failed to parse server response",
    );
  });

  it("requires both a URL and a token before making requests", async () => {
    await expect(testConnection("", "secret")).resolves.toEqual({
      success: false,
      error: "translated:connection.urlRequired",
    });
    await expect(testConnection("https://kimai.test", "")).resolves.toEqual({
      success: false,
      error: "translated:connection.tokenRequired",
    });
    expect(mocks.safeHttpFetch).not.toHaveBeenCalled();
  });

  it("checks user and version in parallel and reports a secure success", async () => {
    mocks.safeHttpFetch.mockImplementation((url: string) => {
      if (url.endsWith("/api/users/me")) return Promise.resolve(jsonResponse(user));
      if (url.includes("/api/metafields?")) {
        return Promise.resolve(jsonResponse({ message: "Not found" }, 404));
      }
      return Promise.resolve(jsonResponse(version));
    });

    await expect(
      testConnection("https://kimai.test/", "secret"),
    ).resolves.toEqual({
      success: true,
      user,
      version,
      insecure: false,
    });
    expect(mocks.safeHttpFetch).toHaveBeenCalledTimes(3);
    expect(mocks.safeHttpFetch).toHaveBeenCalledWith(
      "https://kimai.test/api/users/me",
      expect.objectContaining({
        method: "GET",
        authorization: { type: "test", origin: "https://kimai.test" },
        headers: expect.objectContaining({ Authorization: "Bearer secret" }),
      }),
    );
    expect(mocks.safeHttpFetch).toHaveBeenCalledWith(
      "https://kimai.test/api/metafields?entity=timesheet",
      expect.objectContaining({ method: "GET" }),
    );
  });

  it("normalizes supported visible timesheet custom-field definitions", async () => {
    const longLabel = "x".repeat(300);
    const client = {
      get: vi.fn().mockResolvedValue([
        null,
        [],
        {},
        { name: 42 },
        { name: "hidden", visible: false },
        { name: "bad name" },
        {
          name: " Ticket_URL ",
          label: " Ticket link ",
          type: "UrlType",
          required: true,
        },
        { name: "notes", label: null, type: null },
        { name: "details", label: longLabel, type: "textarea" },
        { name: "ticket_url", label: "Duplicate" },
      ]),
    } as unknown as KimaiClient;

    await expect(getTimesheetCustomFieldDefinitions(client)).resolves.toEqual([
      {
        name: "ticket_url",
        label: "Ticket link",
        type: "url",
        required: true,
      },
      { name: "notes", label: "notes", type: "text", required: false },
      {
        name: "details",
        label: longLabel.slice(0, 256),
        type: "text",
        required: false,
      },
    ]);
    expect(client.get).toHaveBeenCalledWith("/api/metafields", {
      entity: "timesheet",
    });
  });

  it("flags non-loopback HTTP while still allowing connection tests", async () => {
    mocks.safeHttpFetch.mockImplementation((url: string) =>
      Promise.resolve(jsonResponse(url.endsWith("/api/users/me") ? user : version)),
    );

    await expect(testConnection("http://kimai.test", "secret")).resolves.toMatchObject({
      success: true,
      insecure: true,
    });
    await expect(testConnection("http://localhost:8001", "secret")).resolves.toMatchObject({
      success: true,
      insecure: false,
    });
  });

  it("returns structured API failures without throwing", async () => {
    mocks.safeHttpFetch.mockImplementation(() =>
      Promise.resolve(jsonResponse({ message: "Bad credentials" }, 401)),
    );

    await expect(testConnection("https://kimai.test", "bad")).resolves.toEqual({
      success: false,
      error: "Bad credentials",
      errorCode: "unauthorized",
      insecure: false,
    });
  });

  it("converts transport failures into the Kimai network error", async () => {
    mocks.safeHttpFetch.mockRejectedValue(new Error("offline"));

    await expect(testConnection("https://kimai.test", "secret")).resolves.toEqual({
      success: false,
      error: "Could not reach the Kimai server",
      errorCode: "network_error",
      insecure: false,
    });
  });

  it("returns generic validation failures without classifying them as API errors", async () => {
    mocks.safeHttpFetch.mockResolvedValue(jsonResponse({ invalid: true }));
    await expect(testConnection("https://kimai.test", "secret")).resolves.toMatchObject({
      success: false,
      error: "Failed to parse server response",
      insecure: false,
    });
  });

});
