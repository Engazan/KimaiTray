// @vitest-environment jsdom

import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
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

vi.mock("./DateTimePicker", () => ({
  default: ({ id, value, onChange, disabled }: any) => (
    <input id={id} aria-label="mock-date-time" value={value} disabled={disabled} onChange={(event) => onChange(event.target.value)} />
  ),
}));

const apiMocks = vi.hoisted(() => ({
  getCustomers: vi.fn(),
  getProjects: vi.fn(),
  getActivities: vi.fn(),
  createActivity: vi.fn(),
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
  createActivity: apiMocks.createActivity,
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

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

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
  const result = render(
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
  return { ...result, onSubmit };
}

describe("new task entity selects", () => {
  it("creates and selects an activity after a project is chosen", async () => {
    const created = {
      id: 30,
      name: "New global activity",
      project: null,
      visible: true,
      billable: true,
      color: null,
      comment: null,
    };
    apiMocks.getActivities
      .mockResolvedValueOnce([])
      .mockResolvedValue([created]);
    apiMocks.createActivity.mockResolvedValue(created);
    const user = userEvent.setup();
    renderForm({ autoFocusProject: false });

    expect(
      screen.queryByRole("button", { name: "Add activity" }),
    ).toBeNull();
    await user.click(screen.getByLabelText("Project"));
    await user.click(await screen.findByRole("option", { name: "Alpha" }));
    await user.click(
      await screen.findByRole("button", { name: "Add activity" }),
    );

    await user.click(screen.getByRole("radio", { name: "Global" }));
    await user.type(screen.getByLabelText("Name"), "New global activity");
    await user.click(screen.getByRole("button", { name: "Create" }));

    await waitFor(() =>
      expect(apiMocks.createActivity).toHaveBeenCalledWith(client, {
        name: "New global activity",
        visible: true,
        billable: true,
      }),
    );
    await waitFor(() =>
      expect(screen.queryByRole("dialog", { name: "Create activity" })).toBeNull(),
    );
    expect(apiMocks.getActivities).toHaveBeenCalledTimes(2);
    expect(screen.getByLabelText("Activity").textContent).toContain(
      "New global activity",
    );
  });

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

  it("shows Kimai's generated safe color for projects without a custom color", async () => {
    apiMocks.getProjects.mockResolvedValue([
      {
        id: 1,
        name: "No custom project color",
        customer: 1,
        visible: true,
        billable: true,
        color: null,
        "color-safe": "#2ECC40",
        comment: null,
        globalActivities: false,
      },
    ]);
    apiMocks.getActivities.mockResolvedValue([]);
    const user = userEvent.setup();
    renderForm({ autoFocusProject: false });

    await user.click(screen.getByLabelText("Project"));
    const option = await screen.findByRole("option", {
      name: "No custom project color",
    });
    const swatch = option.querySelector<HTMLElement>("span");

    expect(swatch?.style.backgroundColor).toBe("rgb(46, 204, 64)");
  });

  it("shows Kimai's generated safe color for activities without a custom color", async () => {
    apiMocks.getActivities.mockResolvedValue([
      {
        id: 10,
        name: "No custom activity color",
        project: 1,
        visible: true,
        billable: true,
        color: null,
        "color-safe": "#5319e7",
        comment: null,
      },
    ]);
    const user = userEvent.setup();
    renderForm({ autoFocusProject: false });

    await user.click(screen.getByLabelText("Project"));
    await user.click(await screen.findByRole("option", { name: "Alpha" }));
    await waitFor(() =>
      expect(screen.getByLabelText("Activity").textContent).toContain(
        "No custom activity color",
      ),
    );
    await user.click(screen.getByLabelText("Activity"));
    const option = await screen.findByRole("option", {
      name: "No custom activity color",
    });
    const swatch = option.querySelector<HTMLElement>("span");

    expect(swatch?.style.backgroundColor).toBe("rgb(83, 25, 231)");
  });

  it("lists project activities first and separates global activities", async () => {
    apiMocks.getActivities.mockResolvedValue([
      {
        id: 10,
        name: "Project activity",
        project: 1,
        visible: true,
        billable: true,
        color: null,
        comment: null,
      },
      {
        id: 20,
        name: "Global activity",
        project: null,
        visible: true,
        billable: true,
        color: null,
        comment: null,
      },
    ]);
    const user = userEvent.setup();
    renderForm({ autoFocusProject: false });

    await user.click(screen.getByLabelText("Project"));
    await user.click(await screen.findByRole("option", { name: "Alpha" }));

    const options = await screen.findAllByRole("option");
    expect(options.map((option) => option.textContent)).toEqual([
      "Project activity",
      "Global activity",
    ]);
    const listboxText = screen.getByRole("listbox").textContent ?? "";
    expect(listboxText.indexOf("Local")).toBeLessThan(
      listboxText.indexOf("Project activity"),
    );
    expect(listboxText.indexOf("Global")).toBeGreaterThan(
      listboxText.indexOf("Project activity"),
    );
    expect(listboxText.indexOf("Global")).toBeLessThan(
      listboxText.indexOf("Global activity"),
    );
    expect(options[0].className).toContain("border-b");
    expect(options[1].className).not.toContain("border-b");
  });
});

describe("new task keyboard flow", () => {
  it("uses an in-memory autofocus preference when storage is unavailable", async () => {
    vi.stubGlobal("localStorage", undefined);
    const user = userEvent.setup();
    renderForm({ autoFocusProject: false });
    await user.click(screen.getByRole("button", { name: "Disable autofocus" }));
    expect(screen.getByRole("button", { name: "Enable autofocus" })).toBeTruthy();
  });

  it("falls back when reading or writing the autofocus preference throws", async () => {
    const storage = {
      getItem: vi.fn(() => { throw new Error("read blocked"); }),
      setItem: vi.fn(() => { throw new Error("write blocked"); }),
    };
    vi.stubGlobal("localStorage", storage);
    const user = userEvent.setup();
    renderForm({ autoFocusProject: false });
    await user.click(screen.getByRole("button", { name: "Disable autofocus" }));
    expect(storage.setItem).toHaveBeenCalled();
  });

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

  it("requires configured fields and validates URL values", async () => {
    apiMocks.getActivities.mockResolvedValue([{ id: 10, name: "Work", project: 1, visible: true, billable: true, color: null, comment: null }]);
    const user = userEvent.setup();
    const { onSubmit } = renderForm({
      autoFocusProject: false,
      pluginCustomInputs: getEnabledPluginCustomInputs(
        { creativeIssueLink: false },
        [{ name: "url_link", label: "URL link", type: "url", required: true }],
      ),
    });

    await user.click(screen.getByRole("button", { name: "Project" }));
    await user.click(await screen.findByRole("option", { name: "Alpha" }));
    await waitFor(() => expect(screen.getByLabelText("Activity").textContent).toContain("Work"));
    const start = screen.getByRole("button", { name: "Start" });
    expect((start as HTMLButtonElement).disabled).toBe(true);

    await user.type(screen.getByLabelText("URL link"), "ftp://invalid.test");
    expect(screen.getByText("Enter a valid HTTP or HTTPS URL.")).toBeTruthy();
    expect((start as HTMLButtonElement).disabled).toBe(true);
    await user.clear(screen.getByLabelText("URL link"));
    await user.type(screen.getByLabelText("URL link"), "https://example.test/ticket/34");
    await user.click(start);

    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({ metadata: { url_link: "https://example.test/ticket/34" } }),
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

    const customTargetIssuePicker = screen.getByLabelText("Issue");
    if (customTargetIssuePicker.getAttribute("aria-expanded") !== "true") {
      await user.click(customTargetIssuePicker);
    }
    await user.click(
      (await screen.findByText("Custom input target")).closest("button")!,
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
    const descriptionTargetIssuePicker = screen.getByLabelText("Issue");
    if (descriptionTargetIssuePicker.getAttribute("aria-expanded") !== "true") {
      await user.click(descriptionTargetIssuePicker);
    }
    await user.click(
      (await screen.findByText("Description target")).closest("button")!,
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

  it("appends an auto-inserted issue URL to an existing description", async () => {
    integrationMocks.useIssues.mockReturnValue({
      issues: [{ id: 9, title: "Existing note", state: "opened", webUrl: "https://git.test/9", labels: [], author: "a" }],
      isLoading: false, isError: false, error: null,
    });
    const user = userEvent.setup();
    renderForm({
      autoFocusProject: false,
      showNote: true,
      showIssuePicker: true,
      issueToken: "token",
      initialValues: { description: "Keep this" },
      issueIntegrationConfig: {
        enabled: true, provider: "gitlab", baseUrl: "https://git.test", apiBaseUrl: "", projectPathOrRepo: "", defaultState: "opened",
        assigneeOnly: false, syncTime: false, autoInsertUrl: true, showTimeEstimate: false, filterLabels: [], filterLabelsMode: "include",
      },
    });
    const existingNoteIssuePicker = screen.getByLabelText("Issue");
    if (existingNoteIssuePicker.getAttribute("aria-expanded") !== "true") {
      await user.click(existingNoteIssuePicker);
    }
    await user.click((await screen.findByText("Existing note")).closest("button")!);
    expect((screen.getByLabelText("Description") as HTMLTextAreaElement).value).toBe("Keep this\nhttps://git.test/9");
  });

  it("focuses the issue picker when no repository picker is available", async () => {
    apiMocks.getActivities.mockResolvedValue([{ id: 10, name: "Work", project: 1, visible: true, billable: true, color: null, comment: null }]);
    integrationMocks.useIssues.mockReturnValue({
      issues: [{ id: 1, title: "Issue", state: "opened", webUrl: "https://git.test/1", labels: [], author: "a" }],
      isLoading: false,
      isError: false,
      error: null,
    });
    const user = userEvent.setup();
    renderForm({
      showIssuePicker: true,
      issueToken: "token",
      issueIntegrationConfig: {
        enabled: true, provider: "gitlab", baseUrl: "https://git.test", apiBaseUrl: "", projectPathOrRepo: "", defaultState: "opened",
        assigneeOnly: false, syncTime: false, autoInsertUrl: false, showTimeEstimate: false, filterLabels: [], filterLabelsMode: "include",
      },
    });
    await user.type(await screen.findByRole("combobox"), "Alpha");
    await user.keyboard("{Enter}");
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole("combobox")));
    await user.keyboard("{Enter}");
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole("button", { name: "Start" })));
  });

  it("refreshes entity lists, changes customer and cancels from both controls", async () => {
    apiMocks.getCustomers.mockResolvedValue([{ id: 1, name: "Customer", visible: true, color: null, comment: null, country: "SK", currency: "EUR", number: null }]);
    apiMocks.getActivities.mockResolvedValue([]);
    const user = userEvent.setup();
    const onCancel = vi.fn();
    renderForm({ showCustomerSelect: true, onCancel, autoFocusProject: false });
    const projectsBeforeRefresh = apiMocks.getProjects.mock.calls.length;
    await user.click(screen.getByRole("button", { name: "Refresh projects, activities and tags" }));
    await waitFor(() => expect(apiMocks.getProjects.mock.calls.length).toBeGreaterThan(projectsBeforeRefresh));
    await user.click(screen.getByLabelText("Customer"));
    await user.click(await screen.findByRole("option", { name: "Customer" }));
    await user.click(screen.getAllByRole("button", { name: "Cancel" })[0]);
    await user.click(screen.getAllByRole("button", { name: "Cancel" })[1]);
    expect(onCancel).toHaveBeenCalledTimes(2);
  });

  it("edits note, tags and custom time and submits all optional values", async () => {
    apiMocks.getActivities.mockResolvedValue([{ id: 10, name: "Work", project: 1, visible: true, billable: true, color: null, comment: null }]);
    const user = userEvent.setup();
    const { onSubmit } = renderForm({ autoFocusProject: false, showNote: true, showTags: true, showCustomStartTime: true });
    await user.click(screen.getByRole("button", { name: "Project" }));
    await user.click(await screen.findByRole("option", { name: "Alpha" }));
    await waitFor(() => expect(screen.getByLabelText("Activity").textContent).toContain("Work"));
    await user.type(screen.getByLabelText("Description"), " Note ");
    await user.click(screen.getByRole("button", { name: "More options" }));
    await user.type(screen.getByLabelText("Tags"), "tag");
    await user.click(screen.getByRole("button", { name: "Custom" }));
    await user.type(screen.getByLabelText("mock-date-time"), "2020-01-01T10:00");
    await user.click(screen.getByRole("button", { name: "Start" }));
    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ begin: "2020-01-01T10:00:00", description: "Note" }), null);
    await user.click(screen.getByRole("button", { name: "Use now" }));
    await user.click(screen.getByRole("button", { name: "More options" }));
  });

  it("ignores submit shortcuts while incomplete and follows changed integration configuration", async () => {
    const firstConfig: NonNullable<
      ComponentProps<typeof NewTaskForm>["issueIntegrationConfig"]
    > = {
      enabled: true, provider: "gitlab", baseUrl: "https://one.test", apiBaseUrl: "", projectPathOrRepo: "one/repo", defaultState: "opened",
      assigneeOnly: false, syncTime: false, autoInsertUrl: false, showTimeEstimate: false, filterLabels: [], filterLabelsMode: "include",
    };
    const { onSubmit, rerender, container } = renderForm({ autoFocusProject: false, showIssuePicker: true, issueToken: "token", issueIntegrationConfig: firstConfig });
    fireEvent.keyDown(container.firstElementChild!, { key: "Enter", ctrlKey: true });
    expect(onSubmit).not.toHaveBeenCalled();
    rerender(
      <I18nextProvider i18n={i18n}>
        <QueryClientProvider client={new QueryClient()}>
          <NewTaskForm client={client} hasActiveTimer={false} onSubmit={onSubmit} onCancel={vi.fn()} isSubmitting={false} showNote={false} showTags={false} showCustomerSelect={false} showCustomStartTime={false} autoFocusProject={false} showIssuePicker issueToken="token" issueIntegrationConfig={{ ...firstConfig, baseUrl: "https://two.test", projectPathOrRepo: "two/repo" }} />
        </QueryClientProvider>
      </I18nextProvider>,
    );
    expect(screen.getByLabelText("Repository").textContent).toContain("two/repo");
  });

  it("submits initial tags and shows every submit-state label", async () => {
    apiMocks.getActivities.mockResolvedValue([{ id: 10, name: "Work", project: 1, visible: true, billable: true, color: null, comment: null }]);
    const user = userEvent.setup();
    const { onSubmit, rerender } = renderForm({ autoFocusProject: false, initialValues: { tags: ["preset"] } });
    await user.click(screen.getByRole("button", { name: "Project" }));
    await user.click(await screen.findByRole("option", { name: "Alpha" }));
    await waitFor(() => expect(screen.getByLabelText("Activity").textContent).toContain("Work"));
    await user.click(screen.getByRole("button", { name: "Start" }));
    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ tags: ["preset"] }), null);

    rerender(<I18nextProvider i18n={i18n}><QueryClientProvider client={new QueryClient()}><NewTaskForm client={client} hasActiveTimer onSubmit={onSubmit} onCancel={vi.fn()} isSubmitting={false} showNote={false} showTags={false} showCustomerSelect={false} showCustomStartTime={false} /></QueryClientProvider></I18nextProvider>);
    expect(screen.getByRole("button", { name: "Stop & Start" })).toBeTruthy();
    rerender(<I18nextProvider i18n={i18n}><QueryClientProvider client={new QueryClient()}><NewTaskForm client={client} hasActiveTimer={false} onSubmit={onSubmit} onCancel={vi.fn()} isSubmitting showNote={false} showTags={false} showCustomerSelect={false} showCustomStartTime={false} /></QueryClientProvider></I18nextProvider>);
    expect(screen.getByTitle("Use Ctrl/Cmd + Enter to start a task from the new-task form.").querySelector(".animate-spin")).toBeTruthy();
  });
});
