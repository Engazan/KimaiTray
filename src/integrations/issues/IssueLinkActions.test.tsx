// @vitest-environment jsdom

import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { I18nextProvider } from "react-i18next";
import i18n, { initPromise } from "../../shared/i18n";
import IssueLinkActions from "./IssueLinkActions";

const mocks = vi.hoisted(() => ({ openUrl: vi.fn(), writeText: vi.fn() }));
vi.mock("@tauri-apps/plugin-opener", () => ({ openUrl: mocks.openUrl }));

beforeAll(async () => { await initPromise; await i18n.changeLanguage("en"); });
beforeEach(() => {
  vi.clearAllMocks();
  Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: mocks.writeText } });
  mocks.writeText.mockResolvedValue(undefined);
});
afterEach(() => { cleanup(); vi.useRealTimers(); });

const issue = { id: 42, title: "Fix bug", state: "opened", webUrl: "https://issues.test/42", labels: [], author: "Ada" };

function renderActions(description: string, onDescriptionChange = vi.fn()) {
  render(<I18nextProvider i18n={i18n}><IssueLinkActions issue={issue} description={description} onDescriptionChange={onDescriptionChange} /></I18nextProvider>);
  return onDescriptionChange;
}

describe("IssueLinkActions", () => {
  it("opens and appends links to an existing description", async () => {
    const change = renderActions(" Existing ");
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /open in browser/i }));
      await Promise.resolve();
    });
    expect(mocks.openUrl).toHaveBeenCalledWith(issue.webUrl);
    fireEvent.click(screen.getByRole("button", { name: /^add url$/i }));
    fireEvent.click(screen.getByRole("button", { name: /add title/i }));
    expect(change).toHaveBeenNthCalledWith(1, `Existing\n${issue.webUrl}`);
    expect(change).toHaveBeenNthCalledWith(2, `Existing\nIssue: #42 Fix bug\n${issue.webUrl}`);
  });

  it("adds links to empty descriptions and resets copied feedback", async () => {
    vi.useFakeTimers();
    const change = renderActions("   ");
    fireEvent.click(screen.getByRole("button", { name: /^add url$/i }));
    fireEvent.click(screen.getByRole("button", { name: /add title/i }));
    expect(change).toHaveBeenNthCalledWith(1, issue.webUrl);
    expect(change).toHaveBeenNthCalledWith(2, `Issue: #42 Fix bug\n${issue.webUrl}`);

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /copy url/i }));
      await Promise.resolve();
    });
    expect(mocks.writeText).toHaveBeenCalledWith(issue.webUrl);
    expect(screen.getByRole("button", { name: /copied/i })).toBeTruthy();
    await act(async () => vi.advanceTimersByTimeAsync(1_500));
    expect(screen.getByRole("button", { name: /copy url/i })).toBeTruthy();
  });
});
