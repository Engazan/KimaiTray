// @vitest-environment jsdom

import type { PropsWithChildren } from "react";
import { act, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { KimaiClient } from "../api/kimaiClient";

const timesheetMocks = vi.hoisted(() => ({
  updateTimesheet: vi.fn(),
  updateTimesheetMeta: vi.fn(),
}));

vi.mock("../api/timesheetApi", () => timesheetMocks);

import { useEditTimer } from "./useEditTimer";

const client = {
  connectionId: "connection-a",
  cacheScope: "connection-a:token",
} as KimaiClient;

function wrapper({ children }: PropsWithChildren) {
  return (
    <QueryClientProvider client={new QueryClient()}>
      {children}
    </QueryClientProvider>
  );
}

describe("active timer editing", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    timesheetMocks.updateTimesheet.mockResolvedValue({ id: 42 });
    timesheetMocks.updateTimesheetMeta.mockResolvedValue({ id: 42 });
  });

  it("updates plugin fields through the timesheet meta endpoint", async () => {
    const { result } = renderHook(() => useEditTimer(client), { wrapper });

    act(() => {
      result.current.editTimer(42, {
        metadata: { issue_link: "CREATIVE-456" },
      });
    });

    await waitFor(() =>
      expect(timesheetMocks.updateTimesheetMeta).toHaveBeenCalledWith(
        client,
        42,
        { name: "issue_link", value: "CREATIVE-456" },
      ),
    );
    expect(timesheetMocks.updateTimesheet).not.toHaveBeenCalled();
  });

  it("allows clearing a plugin field", async () => {
    const { result } = renderHook(() => useEditTimer(client), { wrapper });

    act(() => {
      result.current.editTimer(42, {
        metadata: { issue_link: "" },
      });
    });

    await waitFor(() =>
      expect(timesheetMocks.updateTimesheetMeta).toHaveBeenCalledWith(
        client,
        42,
        { name: "issue_link", value: "" },
      ),
    );
  });

  it("updates ordinary fields and serialized tags", async () => {
    const { result } = renderHook(() => useEditTimer(client), { wrapper });
    act(() => result.current.editTimer(42, { description: "Updated", tags: ["one", "two"] }));
    await waitFor(() => expect(timesheetMocks.updateTimesheet).toHaveBeenCalledWith(
      client,
      42,
      { description: "Updated", tags: "one,two" },
    ));
  });
});
