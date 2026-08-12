// @vitest-environment jsdom

import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { I18nextProvider } from "react-i18next";
import i18n, { initPromise } from "../../shared/i18n";
import IssuePicker from "./IssuePicker";

const issueMocks = vi.hoisted(() => ({
  result: { issues: [] as any[], isLoading: false },
  useIssues: vi.fn(() => issueMocks.result),
}));

vi.mock("./useIssues", () => ({ useIssues: issueMocks.useIssues }));

beforeAll(async () => {
  Element.prototype.scrollIntoView = vi.fn();
  await initPromise;
  await i18n.changeLanguage("en");
});

beforeEach(() => {
  issueMocks.result = { issues: [], isLoading: false };
  vi.clearAllMocks();
});

afterEach(cleanup);

const config = {
  enabled: true,
  provider: "gitlab",
  baseUrl: "https://git.test",
  projectPathOrRepo: "group/repo",
  defaultState: "opened",
  assigneeOnly: false,
  syncTime: false,
  autoInsertUrl: false,
  showTimeEstimate: true,
  filterLabels: [],
  filterLabelsMode: "include",
} as const;

const issues = [
  { id: 1, title: "General maintenance", state: "closed", webUrl: "https://git.test/1", labels: [], author: "a", timeEstimate: 18_000, timeSpent: 0 },
  { id: 2, title: "Álpha project fix", state: "opened", webUrl: "https://git.test/2", labels: [], author: "b", timeEstimate: 5_400, timeSpent: 6_000 },
];

function renderPicker(overrides: Record<string, unknown> = {}) {
  const onSelectIssue = vi.fn();
  const result = render(
    <I18nextProvider i18n={i18n}>
      <IssuePicker
        id="issue"
        config={config as any}
        token="token"
        connectionId="connection"
        selectedIssue={null}
        onSelectIssue={onSelectIssue}
        {...overrides}
      />
    </I18nextProvider>,
  );
  return { ...result, onSelectIssue };
}

describe("IssuePicker", () => {
  it("shows loading and empty states and closes on an outside click", async () => {
    const user = userEvent.setup();
    issueMocks.result = { issues: [], isLoading: true };
    const { rerender } = renderPicker();
    await user.click(screen.getByRole("button", { name: /Search issues/ }));
    expect(screen.getByText(/Loading/)).toBeTruthy();

    issueMocks.result = { issues: [], isLoading: false };
    rerender(
      <I18nextProvider i18n={i18n}>
        <IssuePicker id="issue" config={config as any} token="token" connectionId="connection" selectedIssue={null} onSelectIssue={vi.fn()} />
      </I18nextProvider>,
    );
    expect(screen.getByText(/No matching issues/)).toBeTruthy();
    await user.type(screen.getByRole("combobox"), "query");
    fireEvent.mouseDown(document.body);
    expect(screen.queryByRole("listbox")).toBeNull();
  });

  it("suggests normalized project matches and selects with keyboard navigation", async () => {
    const user = userEvent.setup();
    issueMocks.result = { issues, isLoading: false };
    const { onSelectIssue } = renderPicker({ projectName: "alpha" });
    await user.click(screen.getByRole("button", { name: /Search issues/ }));
    expect(screen.getByRole("option", { name: /#2/ }).getAttribute("title")).toMatch(/selected project/);
    await user.keyboard("{ArrowDown}{ArrowUp}{Enter}");
    expect(onSelectIssue).toHaveBeenCalledWith(issues[1]);
    expect(screen.queryByRole("listbox")).toBeNull();
  });

  it("closes with Escape without bubbling and selects by click", async () => {
    const user = userEvent.setup();
    issueMocks.result = { issues, isLoading: false };
    const parentKey = vi.fn();
    const { onSelectIssue } = renderPicker();
    document.body.addEventListener("keydown", parentKey);
    await user.click(screen.getByRole("button", { name: /Search issues/ }));
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("listbox")).toBeNull();
    expect(parentKey).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: /Search issues/ }));
    await user.click(screen.getByRole("option", { name: /#1/ }));
    expect(onSelectIssue).toHaveBeenCalledWith(issues[0]);
    document.body.removeEventListener("keydown", parentKey);
  });

  it("opens once for a focus request and respects disabled state", () => {
    issueMocks.result = { issues, isLoading: false };
    const { rerender } = renderPicker({ focusRequest: 1 });
    expect(screen.getByRole("listbox")).toBeTruthy();
    fireEvent.keyDown(screen.getByRole("combobox"), { key: "Escape" });
    rerender(
      <I18nextProvider i18n={i18n}>
        <IssuePicker id="issue" config={config as any} token="token" connectionId="connection" selectedIssue={null} onSelectIssue={vi.fn()} focusRequest={1} />
      </I18nextProvider>,
    );
    expect(screen.queryByRole("listbox")).toBeNull();
    rerender(
      <I18nextProvider i18n={i18n}>
        <IssuePicker id="issue" config={config as any} token="token" connectionId="connection" selectedIssue={null} onSelectIssue={vi.fn()} focusRequest={2} disabled />
      </I18nextProvider>,
    );
    expect(screen.queryByRole("listbox")).toBeNull();
  });

  it("renders estimate variants and clears a selected issue", async () => {
    const user = userEvent.setup();
    const selected = { ...issues[1], timeEstimate: 5_400, timeSpent: 6_000 };
    const { onSelectIssue, rerender } = renderPicker({ selectedIssue: selected });
    expect(screen.getByText("1h40m / 1h30m")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Delete" }));
    expect(onSelectIssue).toHaveBeenCalledWith(null);
    rerender(
      <I18nextProvider i18n={i18n}>
        <IssuePicker id="issue" config={config as any} token="token" connectionId="connection" selectedIssue={{ ...selected, timeEstimate: 0 }} onSelectIssue={vi.fn()} disabled />
      </I18nextProvider>,
    );
    expect(screen.queryByText(/\//)).toBeNull();
    expect(screen.queryByRole("button", { name: "Delete" })).toBeNull();
  });

  it("handles keyboard navigation with no results", async () => {
    const user = userEvent.setup();
    renderPicker({ focusRequest: 1, projectName: "x" });
    const input = screen.getByRole("combobox");
    await user.type(input, "none");
    await user.keyboard("{ArrowDown}{ArrowUp}{Enter}");
    expect(screen.getByRole("listbox")).toBeTruthy();
  });
});
