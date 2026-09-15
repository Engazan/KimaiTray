// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import IssueTimeSyncFeedback from "./IssueTimeSyncFeedback";
import type { useIssueTimeSync } from "../tray/useIssueTimeSync";
import { openUrl } from "@tauri-apps/plugin-opener";
vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
vi.mock("@tauri-apps/plugin-opener", () => ({ openUrl: vi.fn() }));
vi.mock("../integrations/issues/issueTimeSyncQueue", () => ({ matchesTimeSyncSession: (job: { destination: string }) => job.destination === "same" }));

afterEach(cleanup);

function sync(): ReturnType<typeof useIssueTimeSync> {
  return {
    track: vi.fn(), flush: vi.fn(), resolve: vi.fn(), resolving: false, storageError: false,
    session: {} as NonNullable<ReturnType<typeof useIssueTimeSync>["session"]>,
    problems: [{ id: "42", connectionId: "work", kimaiUrl: "https://kimai.test", destination: "same", timesheetId: 42, issueId: 8, issueUrl: "https://git.test/8", status: "uncertain", nextAttemptAt: 0, error: null }],
  };
}
describe("issue time sync recovery feedback", () => {
  it("requires an explicit missing-time confirmation before retrying and supports acknowledging a write", async () => {
    const user = userEvent.setup();
    const state = sync();
    render(<IssueTimeSyncFeedback sync={state} />);
    await user.click(screen.getByText("timeSync.retry"));
    expect(state.resolve).not.toHaveBeenCalled();
    await user.click(screen.getByText("common.cancel"));
    expect(screen.queryByText("timeSync.retryWarning")).toBeNull();
    await user.click(screen.getByText("timeSync.retry"));
    await user.click(screen.getByText("timeSync.confirmRetry"));
    expect(state.resolve).toHaveBeenCalledWith("42", "retry");
    await user.click(screen.getByText("timeSync.recorded"));
    expect(state.resolve).toHaveBeenCalledWith("42", "recorded");
  });
  it("shows pending, changed-target and storage failures and handles browser open errors", async () => {
    const user = userEvent.setup();
    const state = sync();
    state.storageError = true;
    state.problems[0].status = "watching";
    const { rerender } = render(<IssueTimeSyncFeedback sync={state} />);
    expect(screen.getByText("timeSync.storageError")).toBeTruthy();
    expect(screen.getByText("timeSync.pending")).toBeTruthy();
    vi.mocked(openUrl).mockRejectedValueOnce(new Error("browser"));
    await user.click(screen.getByText("integrations.openInBrowser"));
    expect(await screen.findByText("timeSync.openError")).toBeTruthy();
    state.problems[0].destination = "other";
    rerender(<IssueTimeSyncFeedback sync={state} />);
    expect(screen.getByText("timeSync.destinationChanged")).toBeTruthy();
    expect(screen.queryByText("timeSync.retry")).toBeNull();
    state.problems = [];
    state.storageError = false;
    rerender(<IssueTimeSyncFeedback sync={state} />);
    expect(screen.queryByText("timeSync.title")).toBeNull();
  });
});
