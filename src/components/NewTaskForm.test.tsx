// @vitest-environment jsdom

import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { I18nextProvider } from "react-i18next";
import type { KimaiClient } from "../api/kimaiClient";
import i18n, { initPromise } from "../shared/i18n";
import NewTaskForm from "./NewTaskForm";

const apiMocks = vi.hoisted(() => ({
  getCustomers: vi.fn(),
  getProjects: vi.fn(),
  getActivities: vi.fn(),
}));

vi.mock("../api/projectApi", () => ({
  getCustomers: apiMocks.getCustomers,
  getProjects: apiMocks.getProjects,
}));
vi.mock("../api/activityApi", () => ({
  getActivities: apiMocks.getActivities,
}));
vi.mock("../hooks/useKimaiTags", () => ({ useKimaiTags: () => [] }));

beforeAll(async () => {
  Element.prototype.scrollIntoView = vi.fn();
  await initPromise;
  await i18n.changeLanguage("en");
});

beforeEach(() => {
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

function renderForm() {
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
        />
      </QueryClientProvider>
    </I18nextProvider>,
  );
  return { onSubmit };
}

describe("new task keyboard flow", () => {
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
