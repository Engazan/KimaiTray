import { beforeEach, describe, expect, it, vi } from "vitest";

const core = vi.hoisted(() => ({ invoke: vi.fn() }));

vi.mock("@tauri-apps/api/core", () => core);

import { resolveSafeRedirect, safeHttpFetch } from "./safeHttp";

describe("safe HTTP redirects", () => {
  const origin = "https://kimai.example.test";

  beforeEach(() => vi.resetAllMocks());

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
      method: "POST",
      headers: {
        Authorization: "Bearer secret",
        "Content-Type": "application/json",
      },
      body: '{"project":1}',
    });

    expect(core.invoke).toHaveBeenCalledWith("http_request", {
      request: {
        url: `${origin}/api/timesheets`,
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

    const response = await safeHttpFetch(`${origin}/api/version`);

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
});
