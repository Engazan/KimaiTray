import { beforeEach, describe, expect, it, vi } from "vitest";
import ipcContract from "../../contracts/ipc-contract.json";

const core = vi.hoisted(() => ({ invoke: vi.fn() }));

vi.mock("@tauri-apps/api/core", () => core);

import { resolveSafeRedirect, safeHttpFetch } from "./safeHttp";

describe("safe HTTP redirects", () => {
  const origin = "https://kimai.example.test";

  beforeEach(() => vi.resetAllMocks());

  it("keeps authorization variants aligned with the native contract", () => {
    expect(ipcContract.httpAuthorizationTypes).toEqual([
      "kimai",
      "issue",
      "category",
      "test",
    ]);
  });

  it("accepts relative redirects on the authenticated origin", () => {
    expect(
      resolveSafeRedirect(
        `${origin}/api/timesheets`,
        "/index.php/api/timesheets",
        origin,
      ),
    ).toBe(`${origin}/index.php/api/timesheets`);
  });

  it("blocks redirects that could leak an authorization header", () => {
    expect(() =>
      resolveSafeRedirect(
        `${origin}/api/timesheets`,
        "https://attacker.example/collect",
        origin,
      ),
    ).toThrow(/Cross-origin/);
    expect(() =>
      resolveSafeRedirect(
        `${origin}/api/timesheets`,
        "http://kimai.example.test/api/timesheets",
        origin,
      ),
    ).toThrow();
  });

  it("sends bounded requests through the native broker", async () => {
    core.invoke.mockResolvedValue({
      status: 200,
      statusText: "OK",
      headers: [["content-type", "application/json"]],
      body: '{"ok":true}',
    });

    const response = await safeHttpFetch(`${origin}/api/timesheets`, {
      authorization: { type: "kimai", connectionId: "connection-a" },
      method: "POST",
      headers: {
        Authorization: "Bearer secret",
        "Content-Type": "application/json",
      },
      body: '{"project":1}',
    });

    expect(core.invoke).toHaveBeenCalledWith("http_request", {
      request: {
        requestId: expect.any(String),
        url: `${origin}/api/timesheets`,
        authorization: { type: "kimai", connectionId: "connection-a" },
        method: "POST",
        headers: expect.arrayContaining([
          ["authorization", "Bearer secret"],
          ["content-type", "application/json"],
        ]),
        body: '{"project":1}',
      },
    });
    await expect(response.json()).resolves.toEqual({ ok: true });
  });

  it("follows only same-origin redirects through separate broker calls", async () => {
    core.invoke
      .mockResolvedValueOnce({
        status: 302,
        statusText: "Found",
        headers: [["location", "/index.php/api/version"]],
        body: "",
      })
      .mockResolvedValueOnce({
        status: 200,
        statusText: "OK",
        headers: [],
        body: "done",
      });

    const response = await safeHttpFetch(`${origin}/api/version`, {
      authorization: { type: "kimai", connectionId: "connection-a" },
    });

    expect(core.invoke).toHaveBeenCalledTimes(2);
    expect(core.invoke).toHaveBeenLastCalledWith(
      "http_request",
      expect.objectContaining({
        request: expect.objectContaining({
          url: `${origin}/index.php/api/version`,
        }),
      }),
    );
    await expect(response.text()).resolves.toBe("done");
  });

  it("propagates AbortSignal cancellation to the native request", async () => {
    let rejectRequest!: (reason: unknown) => void;
    core.invoke.mockImplementation((command: string) => {
      if (command === "http_request") {
        return new Promise((_resolve, reject) => {
          rejectRequest = reject;
        });
      }
      if (command === "cancel_http_request") {
        rejectRequest("HTTP request cancelled");
        return Promise.resolve();
      }
      return Promise.reject(new Error("unexpected command"));
    });
    const controller = new AbortController();
    const request = safeHttpFetch(`${origin}/api/version`, {
      authorization: { type: "kimai", connectionId: "connection-a" },
      signal: controller.signal,
    });
    await vi.waitFor(() =>
      expect(core.invoke).toHaveBeenCalledWith(
        "http_request",
        expect.any(Object),
      ),
    );

    controller.abort();

    await expect(request).rejects.toBe("HTTP request cancelled");
    expect(core.invoke).toHaveBeenCalledWith("cancel_http_request", {
      requestId: expect.any(String),
    });
  });

  it("rejects a target outside the client-authorized origin before IPC", async () => {
    await expect(
      safeHttpFetch("https://attacker.example/collect", {
        authorization: { type: "test", origin },
      }),
    ).rejects.toThrow(/not authorized/);
    expect(core.invoke).not.toHaveBeenCalled();
  });

  it("converts POST to GET after a 303 and strips body headers", async () => {
    core.invoke
      .mockResolvedValueOnce({
        status: 303,
        statusText: "See Other",
        headers: [["location", "/result"]],
        body: "",
      })
      .mockResolvedValueOnce({
        status: 200,
        statusText: "OK",
        headers: [],
        body: "done",
      });

    await safeHttpFetch(`${origin}/submit`, {
      authorization: { type: "kimai", connectionId: "connection-a" },
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ name: "Kimai Tray" }),
    });

    expect(core.invoke).toHaveBeenLastCalledWith("http_request", {
      request: expect.objectContaining({
        url: `${origin}/result`,
        method: "GET",
        headers: [],
        body: undefined,
      }),
    });
  });

  it("returns a redirect response without a location header", async () => {
    core.invoke.mockResolvedValue({
      status: 302,
      statusText: "Found",
      headers: [],
      body: "",
    });

    const response = await safeHttpFetch(`${origin}/api/version`, {
      authorization: { type: "kimai", connectionId: "connection-a" },
    });

    expect(response.status).toBe(302);
    expect(core.invoke).toHaveBeenCalledOnce();
  });

  it("bounds redirect chains", async () => {
    core.invoke.mockResolvedValue({
      status: 307,
      statusText: "Temporary Redirect",
      headers: [["location", "/again"]],
      body: "",
    });

    await expect(
      safeHttpFetch(`${origin}/start`, {
        authorization: { type: "kimai", connectionId: "connection-a" },
      }),
    ).rejects.toThrow("Too many HTTP redirects");
    expect(core.invoke).toHaveBeenCalledTimes(6);
  });

  it("rejects unsupported native request body types before IPC", async () => {
    await expect(
      safeHttpFetch(`${origin}/upload`, {
        authorization: { type: "kimai", connectionId: "connection-a" },
        method: "POST",
        body: new Blob(["binary"]),
      }),
    ).rejects.toThrow("Unsupported HTTP request body");
  });

  it("rejects an already aborted request before IPC", async () => {
    const controller = new AbortController();
    controller.abort(new Error("cancelled before start"));

    await expect(
      safeHttpFetch(`${origin}/api/version`, {
        authorization: { type: "kimai", connectionId: "connection-a" },
        signal: controller.signal,
      }),
    ).rejects.toThrow("cancelled before start");
    expect(core.invoke).not.toHaveBeenCalled();
  });
});
