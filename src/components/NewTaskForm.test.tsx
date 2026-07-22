// @vitest-environment jsdom

import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { I18nextProvider } from "react-i18next";
import type { ComponentProps } from "react";
import type { KimaiClient } from "../api/kimaiClient";
import i18n, { initPromise } from "../shared/i18n";
import NewTaskForm from "./NewTaskForm";

const apiMocks = vi.hoisted(() => ({
  getCustomers: vi.fn(),
  getProjects: vi.fn(),
  getActivities: vi.fn(),
}));
const integrationMocks = vi.hoisted(() => ({
  useRepos: vi.fn(),
  useIssues: vi.fn(),
}));

vi.mock("../api/projectApi", () => ({
  getCustomers: apiMocks.getCustomers,
  getProjects: apiMocks.getProjects,
}));
vi.mock("../api/activityApi", () => ({
  getActivities: apiMocks.getActivities,
}));
vi.mock("../hooks/useKimaiTags", () => ({ useKimaiTags: () => [] }));
vi.mock("../integrations/issues/useRepos", () => ({
  useRepos: integrationMocks.useRepos,
}));
vi.mock("../integrations/issues/useIssues", () => ({
  useIssues: integrationMocks.useIssues,
}));

beforeAll(async () => {
  Element.prototype.scrollIntoView = vi.fn();
  await initPromise;
  await i18n.changeLanguage("en");
});

beforeEach(() => {
  localStorage.clear();
  integrationMocks.useRepos.mockReturnValue({
    repos: [],
    isLoading: false,
    isError: false,
  });
  integrationMocks.useIssues.mockReturnValue({
    issues: [],
    isLoading: false,
    isError: false,
    error: null,
  });
  apiMocks.getCustomers.mockResolvedValue([]);
  apiMocks.getProjects.mockResolvedValue([
    {
      id: 1,
      name: "Alpha",
      customer: 1,
      visible: true,
      billable: true,
      color: null,
      comment: null,
      globalActivities: false,
    },
  ]);
});

afterEach(() => cleanup());

const client = {
  connectionId: "connection-a",
  cacheScope: "connection-a:token",
} as KimaiClient;

function renderForm(
  overrides: Partial<ComponentProps<typeof NewTaskForm>> = {},
) {
  const onSubmit = vi.fn();
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  render(
    <I18nextProvider i18n={i18n}>
      <QueryClientProvider client={queryClient}>
        <NewTaskForm
          client={client}
          hasActiveTimer={false}
          onSubmit={onSubmit}
          onCancel={vi.fn()}
          isSubmitting={false}
          showNote={false}
          showTags={false}
          showCustomerSelect={false}
          showCustomStartTime={false}
          autoFocusProject
          {...overrides}
        />
      </QueryClientProvider>
    </I18nextProvider>,
  );
  return { onSubmit };
}

describe("new task keyboard flow", () => {
  it("enables autofocus by default and remembers when the focus flow is disabled", async () => {
    apiMocks.getActivities.mockResolvedValue([
      {
        id: 10,
        name: "Work",
        project: 1,
        visible: true,
        billable: true,
        color: null,
        comment: null,
      },
    ]);
    const user = userEvent.setup();
    renderForm({ autoFocusProject: false });

    const autoFocusToggle = screen.getByRole("button", {
      name: "Disable autofocus",
    });
    expect(autoFocusToggle.getAttribute("aria-pressed")).toBe("true");

    await user.click(autoFocusToggle);
    expect(
      screen
        .getByRole("button", { name: "Enable autofocus" })
        .getAttribute("aria-pressed"),
    ).toBe("false");

    await user.click(screen.getByRole("button", { name: "Project" }));
    const projectSearch = await screen.findByRole("combobox");
    await user.type(projectSearch, "Alpha");
    await user.keyboard("{Enter}");

    await waitFor(() =>
      expect(screen.getByLabelText("Activity").textContent).toContain("Work"),
    );
    expect(screen.queryByRole("combobox")).toBeNull();
    expect(document.activeElement).not.toBe(
      screen.getByRole("button", { name: "Start" }),
    );

    cleanup();
    renderForm({ autoFocusProject: false });
    expect(
      screen
        .getByRole("button", { name: "Enable autofocus" })
        .getAttribute("aria-pressed"),
    ).toBe("false");
  });

  it("focuses project search and selects the only available activity", async () => {
    apiMocks.getActivities.mockResolvedValue([
      {
        id: 10,
        name: "Work",
        project: 1,
        visible: true,
        billable: true,
        color: null,
        comment: null,
      },
    ]);
    const user = userEvent.setup();
    renderForm();

    const projectSearch = await screen.findByRole("combobox");
    expect(document.activeElement).toBe(projectSearch);
    await user.type(projectSearch, "Alpha");
    await user.keyboard("{Enter}");

    await waitFor(() => {
      expect(screen.getByLabelText("Activity").textContent).toContain("Work");
      expect(document.activeElement).toBe(
        screen.getByRole("button", { name: "Start" }),
      );
    });
  });

  it("moves focus to activity search when several activities are available", async () => {
    apiMocks.getActivities.mockResolvedValue([
      {
        id: 10,
        name: "Development",
        project: 1,
        visible: true,
        billable: true,
        color: null,
        comment: null,
      },
      {
        id: 11,
        name: "Review",
        project: 1,
        visible: true,
        billable: true,
        color: null,
        comment: null,
      },
    ]);
    const user = userEvent.setup();
    renderForm();

    const projectSearch = await screen.findByRole("combobox");
    await user.type(projectSearch, "Alpha");
    await user.keyboard("{Enter}");

    const activitySearch = await screen.findByRole("combobox");
    expect(document.activeElement).toBe(activitySearch);
    await user.type(activitySearch, "Review");
    await user.keyboard("{Enter}");

    await waitFor(() =>
      expect(document.activeElement).toBe(
        screen.getByRole("button", { name: "Start" }),
      ),
    );
  });

  it("includes integration repository and issue selects in the automatic focus flow", async () => {
    apiMocks.getActivities.mockResolvedValue([
      {
        id: 10,
        name: "Work",
        project: 1,
        visible: true,
        billable: true,
        color: null,
        comment: null,
      },
    ]);
    integrationMocks.useRepos.mockReturnValue({
      repos: [{ id: "group/repo", label: "Group / Repo" }],
      isLoading: false,
      isError: false,
    });
    integrationMocks.useIssues.mockReturnValue({
      issues: [
        {
          id: 42,
          title: "Fix focus flow",
          state: "opened",
          webUrl: "https://gitlab.example/group/repo/-/issues/42",
          labels: [],
          author: "developer",
        },
      ],
      isLoading: false,
      isError: false,
      error: null,
    });
    const user = userEvent.setup();
    renderForm({
      showIssuePicker: true,
      issueToken: "gitlab-token",
      issueIntegrationConfig: {
        enabled: true,
        provider: "gitlab",
        baseUrl: "https://gitlab.example",
        apiBaseUrl: "https://gitlab.example/api/v4",
        projectPathOrRepo: "group/repo",
        defaultState: "opened",
        assigneeOnly: false,
        syncTime: false,
        autoInsertUrl: false,
        showTimeEstimate: false,
        filterLabels: [],
        filterLabelsMode: "include",
      },
    });

    const projectSearch = await screen.findByRole("combobox");
    await user.type(projectSearch, "Alpha");
    await user.keyboard("{Enter}");

    const repositorySearch = await screen.findByRole("combobox");
    expect(document.activeElement).toBe(repositorySearch);
    await user.keyboard("{Enter}");

    const issueSearch = await screen.findByRole("combobox");
    expect(document.activeElement).toBe(issueSearch);
    await user.keyboard("{Enter}");

    await waitFor(() =>
      expect(document.activeElement).toBe(
        screen.getByRole("button", { name: "Start" }),
      ),
    );
  });

  it("submits a keyboard-complete task with Control+Enter", async () => {
    apiMocks.getActivities.mockResolvedValue([
      {
        id: 10,
        name: "Work",
        project: 1,
        visible: true,
        billable: true,
        color: null,
        comment: null,
      },
    ]);
    const user = userEvent.setup();
    const { onSubmit } = renderForm();

    const projectSearch = await screen.findByRole("combobox");
    await user.type(projectSearch, "Alpha");
    await user.keyboard("{Enter}");
    await waitFor(() =>
      expect(document.activeElement).toBe(
        screen.getByRole("button", { name: "Start" }),
      ),
    );
    await user.keyboard("{Control>}{Enter}{/Control}");

    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({ projectId: 1, activityId: 10 }),
      null,
    );
  });
});
