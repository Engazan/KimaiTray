// @vitest-environment jsdom

import { render, screen, waitFor, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useMutation, useQuery } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";
import { KimaiApiError } from "../api/kimaiClient";
import QueryProvider from "./QueryProvider";

function QueryProbe({ queryFn, id }: { queryFn: () => Promise<unknown>; id: string }) {
  const query = useQuery({ queryKey: ["provider-test", id], queryFn });
  return <span>{query.status}</span>;
}

function MutationProbe({ mutationFn }: { mutationFn: () => Promise<unknown> }) {
  const mutation = useMutation({ mutationFn });
  return <button onClick={() => mutation.mutate()}>mutate</button>;
}

afterEach(cleanup);

describe("QueryProvider", () => {
  it("emits detailed server errors from queries after one retry", async () => {
    const listener = vi.fn();
    window.addEventListener("kimai-api-error", listener);
    const error = new KimaiApiError(503, "Unavailable", { reason: "down" }, "server_error");
    error.method = "GET";
    error.path = "/api/timesheets";
    const queryFn = vi.fn().mockRejectedValue(error);
    render(<QueryProvider><QueryProbe id="server" queryFn={queryFn} /></QueryProvider>);

    await waitFor(() => expect(screen.getByText("error")).toBeTruthy(), { timeout: 4000 });
    expect(queryFn).toHaveBeenCalledTimes(2);
    const detail = (listener.mock.calls[0][0] as CustomEvent).detail;
    expect(detail).toMatchObject({
      status: 503,
      statusText: "Unavailable",
      endpoint: "GET /api/timesheets",
      message: "Kimai server error",
      body: { reason: "down" },
      timestamp: expect.any(Number),
    });
    window.removeEventListener("kimai-api-error", listener);
  });

  it("does not retry auth errors or emit events for them", async () => {
    const listener = vi.fn();
    window.addEventListener("kimai-api-error", listener);
    const queryFn = vi.fn().mockRejectedValue(new KimaiApiError(401, "Unauthorized", null, "unauthorized"));
    render(<QueryProvider><QueryProbe id="auth" queryFn={queryFn} /></QueryProvider>);
    await waitFor(() => expect(screen.getByText("error")).toBeTruthy(), { timeout: 4000 });
    expect(queryFn).toHaveBeenCalledTimes(1);
    expect(listener).not.toHaveBeenCalled();
    window.removeEventListener("kimai-api-error", listener);
  });

  it("ignores ordinary query failures", async () => {
    const listener = vi.fn();
    window.addEventListener("kimai-api-error", listener);
    const queryFn = vi.fn().mockRejectedValue(new Error("offline"));
    render(<QueryProvider><QueryProbe id="ordinary" queryFn={queryFn} /></QueryProvider>);
    await waitFor(() => expect(screen.getByText("error")).toBeTruthy(), { timeout: 4000 });
    expect(queryFn).toHaveBeenCalledTimes(2);
    expect(listener).not.toHaveBeenCalled();
    window.removeEventListener("kimai-api-error", listener);
  });

  it("emits server errors from mutations", async () => {
    const user = userEvent.setup();
    const listener = vi.fn();
    window.addEventListener("kimai-api-error", listener);
    const error = new KimaiApiError(500, "Error", null, "server_error");
    render(<QueryProvider><MutationProbe mutationFn={vi.fn().mockRejectedValue(error)} /></QueryProvider>);
    await user.click(screen.getByRole("button", { name: "mutate" }));
    await waitFor(() => expect(listener).toHaveBeenCalled());
    window.removeEventListener("kimai-api-error", listener);
  });
});
