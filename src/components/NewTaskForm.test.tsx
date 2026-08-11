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
import {
  CREATIVE_ISSUE_LINK_INPUT_ID,
  getEnabledPluginCustomInputs,
} from "../plugins/customInputs";

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

describe("new task customer select", () => {
  it("shows Kimai's generated safe color for customers without a custom color", async () => {
    apiMocks.getCustomers.mockResolvedValue([
      {
        id: 1,
        name: "No custom color",
        visible: true,
        color: null,
        "color-safe": "#5319e7",
        comment: null,
        country: "SK",
        currency: "EUR",
        number: null,
      },
    ]);
    apiMocks.getActivities.mockResolvedValue([]);
    const user = userEvent.setup();
    renderForm({ showCustomerSelect: true, autoFocusProject: false });

    await user.click(screen.getByLabelText("Customer"));
    const option = await screen.findByRole("option", {
      name: "No custom color",
    });
    const swatch = option.querySelector<HTMLElement>("span");

    expect(swatch?.style.backgroundColor).toBe("rgb(83, 25, 231)");
  });
});

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

  it("submits the Creative issue link field when the plugin is enabled", async () => {
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
    const { onSubmit } = renderForm({
      autoFocusProject: false,
      pluginCustomInputs: getEnabledPluginCustomInputs({
        creativeIssueLink: true,
      }),
    });

    await user.click(screen.getByRole("button", { name: "Project" }));
    const projectSearch = await screen.findByRole("combobox");
    await user.type(projectSearch, "Alpha");
    await user.keyboard("{Enter}");
    await waitFor(() =>
      expect(screen.getByLabelText("Activity").textContent).toContain("Work"),
    );

    await user.type(screen.getByLabelText("Issue / Ticket"), " CREATIVE-123 ");
    await user.click(screen.getByRole("button", { name: "Start" }));

    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: { issue_link: "CREATIVE-123" },
      }),
      null,
    );
  });

  it("keeps deep-linked issue and custom plugin values on initial mount", () => {
    const issue = {
      id: 42,
      title: "Opened from GitLab",
      state: "opened",
      webUrl: "https://gitlab.example/group/repo/-/issues/42",
      labels: [],
      author: "developer",
    };
    renderForm({
      showIssuePicker: true,
      issueToken: "gitlab-token",
      pluginCustomInputs: getEnabledPluginCustomInputs({
        creativeIssueLink: true,
      }),
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
      initialValues: {
        selectedIssue: issue,
        customInputValues: {
          [CREATIVE_ISSUE_LINK_INPUT_ID]: issue.webUrl,
        },
      },
    });

    expect(screen.getByLabelText("Issue").textContent).toContain(
      "#42 Opened from GitLab",
    );
    expect(
      (screen.getByLabelText("Issue / Ticket") as HTMLInputElement).value,
    ).toBe(issue.webUrl);
  });

  it("auto-inserts a selected issue URL into a plugin custom input", async () => {
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
    integrationMocks.useIssues.mockReturnValue({
      issues: [
        {
          id: 42,
          title: "Custom input target",
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
    const pluginCustomInputs = getEnabledPluginCustomInputs({
      creativeIssueLink: true,
    });
    const { onSubmit } = renderForm({
      autoFocusProject: false,
      showIssuePicker: true,
      issueToken: "gitlab-token",
      pluginCustomInputs,
      issueIntegrationConfig: {
        enabled: true,
        provider: "gitlab",
        baseUrl: "https://gitlab.example",
        apiBaseUrl: "https://gitlab.example/api/v4",
        projectPathOrRepo: "group/repo",
        defaultState: "opened",
        assigneeOnly: false,
        syncTime: false,
        autoInsertUrl: true,
        autoInsertUrlTarget: CREATIVE_ISSUE_LINK_INPUT_ID,
        showTimeEstimate: false,
        filterLabels: [],
        filterLabelsMode: "include",
      },
    });

    await user.click(screen.getByRole("button", { name: "Project" }));
    await user.type(await screen.findByRole("combobox"), "Alpha");
    await user.keyboard("{Enter}");
    await waitFor(() =>
      expect(screen.getByLabelText("Activity").textContent).toContain("Work"),
    );

    await user.click(screen.getByLabelText("Issue"));
    await user.click(
      await screen.findByRole("option", { name: /#42 Custom input target/ }),
    );

    expect(
      (screen.getByLabelText("Issue / Ticket") as HTMLInputElement).value,
    ).toBe("https://gitlab.example/group/repo/-/issues/42");
    await user.click(screen.getByRole("button", { name: "Start" }));
    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({
        description: undefined,
        metadata: {
          issue_link: "https://gitlab.example/group/repo/-/issues/42",
        },
      }),
      expect.objectContaining({ id: 42 }),
    );
  });

  it("keeps description as the default auto-insert target", async () => {
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
    integrationMocks.useIssues.mockReturnValue({
      issues: [
        {
          id: 42,
          title: "Description target",
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
    const { onSubmit } = renderForm({
      autoFocusProject: false,
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
        autoInsertUrl: true,
        showTimeEstimate: false,
        filterLabels: [],
        filterLabelsMode: "include",
      },
    });

    await user.click(screen.getByRole("button", { name: "Project" }));
    await user.type(await screen.findByRole("combobox"), "Alpha");
    await user.keyboard("{Enter}");
    await waitFor(() =>
      expect(screen.getByLabelText("Activity").textContent).toContain("Work"),
    );
    await user.click(screen.getByLabelText("Issue"));
    await user.click(
      await screen.findByRole("option", { name: /#42 Description target/ }),
    );
    await user.click(screen.getByRole("button", { name: "Start" }));

    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({
        description: "https://gitlab.example/group/repo/-/issues/42",
        metadata: undefined,
      }),
      expect.objectContaining({ id: 42 }),
    );
  });
});
