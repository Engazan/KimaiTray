// @vitest-environment jsdom

import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { I18nextProvider } from "react-i18next";
import i18n, { initPromise } from "../shared/i18n";
import ApiErrorDialog from "./ApiErrorDialog";
import ChangelogDialog from "./ChangelogDialog";

const mocks = vi.hoisted(() => ({ openUrl: vi.fn() }));
vi.mock("@tauri-apps/plugin-opener", () => ({ openUrl: mocks.openUrl }));

beforeAll(async () => {
  await initPromise;
  await i18n.changeLanguage("en");
});

beforeEach(() => {
  vi.clearAllMocks();
  mocks.openUrl.mockResolvedValue(undefined);
});

afterEach(() => cleanup());

function localized(node: React.ReactNode) {
  return render(<I18nextProvider i18n={i18n}>{node}</I18nextProvider>);
}

function apiError(index: number, body: unknown = null) {
  fireEvent(window, new CustomEvent("kimai-api-error", { detail: {
    status: 500 + index,
    statusText: `Status ${index}`,
    endpoint: index % 2 ? undefined : `/endpoint/${index}`,
    message: `failure ${index}`,
    body,
    timestamp: index,
  } }));
}

describe("ApiErrorDialog details", () => {
  it("keeps the newest five errors and dismisses the queue", () => {
    localized(<ApiErrorDialog />);
    for (let index = 0; index < 6; index += 1) apiError(index, index === 1 ? { reason: "bad" } : null);

    expect(screen.queryByText("failure 0")).toBeNull();
    expect(screen.getByText("failure 1")).toBeTruthy();
    expect(screen.getByRole("button", { name: /dismiss/i }).textContent).toContain("4");
    expect(screen.getByText(/"reason": "bad"/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /dismiss/i }));
    expect(screen.getByText("failure 2")).toBeTruthy();
    expect(screen.getByText("/endpoint/2")).toBeTruthy();
  });

  it("renders scalar and empty bodies and handles all tab paths", () => {
    localized(<ApiErrorDialog />);
    apiError(1, "plain response");
    expect(screen.getByText("plain response")).toBeTruthy();
    const dismiss = screen.getByRole("button", { name: /dismiss/i });
    fireEvent.keyDown(document, { key: "Tab" });
    expect(document.activeElement).toBe(dismiss);
    fireEvent.keyDown(document, { key: "Tab", shiftKey: true });
    expect(document.activeElement).toBe(dismiss);
    fireEvent.keyDown(document, { key: "ArrowDown" });

    dismiss.setAttribute("disabled", "");
    fireEvent.keyDown(document, { key: "Tab" });
    expect(screen.getByText("failure 1")).toBeTruthy();

    fireEvent.click(dismiss);
    apiError(3, 0);
    expect(screen.queryByText("Server response")).toBeNull();
  });
});

describe("ChangelogDialog rendering", () => {
  it("renders markdown variants and opens safe links", async () => {
    const onClose = vi.fn();
    localized(<ChangelogDialog
      version="3.0.0"
      standalone
      onClose={onClose}
      body={"# Heading\nParagraph with **bold** and [website](https://example.test).\n\n- First\n- Second"}
    />);

    expect(screen.getByText("Heading").tagName).toBe("H3");
    expect(screen.getByText("bold").tagName).toBe("STRONG");
    expect(screen.getAllByRole("listitem")).toHaveLength(2);
    mocks.openUrl.mockRejectedValueOnce(new Error("blocked"));
    fireEvent.click(screen.getByRole("button", { name: "website" }));
    await Promise.resolve();
    expect(mocks.openUrl).toHaveBeenCalledWith("https://example.test");

    const closeButtons = screen.getAllByRole("button", { name: /close/i });
    closeButtons[0].focus();
    fireEvent.keyDown(document, { key: "Tab", shiftKey: true });
    expect(document.activeElement).toBe(closeButtons[1]);
    fireEvent.keyDown(document, { key: "Tab" });
    expect(document.activeElement).toBe(closeButtons[0]);
    fireEvent.click(closeButtons[1]);
    expect(onClose).toHaveBeenCalledOnce();
    fireEvent.keyDown(document, { key: "ArrowDown" });
    screen.getAllByRole("button").forEach((button) => button.setAttribute("disabled", ""));
    fireEvent.keyDown(document, { key: "Tab" });
  });

  it("shows an empty-state message and restores prior focus on cleanup", async () => {
    const target = document.createElement("button");
    document.body.append(target);
    target.focus();
    const onClose = vi.fn();
    const { unmount } = localized(<ChangelogDialog version="3" body="  " onClose={onClose} />);
    expect(screen.getByText(/no details/i)).toBeTruthy();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalledOnce();
    unmount();
    await new Promise((resolve) => requestAnimationFrame(resolve));
    expect(document.activeElement).toBe(target);
    target.remove();
  });
});
