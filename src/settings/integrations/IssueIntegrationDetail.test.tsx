// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import IssueIntegrationDetail, { emptyIssueConfig } from "./IssueIntegrationDetail";
import { defaultSettings } from "../service";

const mocks = vi.hoisted(() => ({
  getToken: vi.fn(), saveToken: vi.fn(), provider: {} as any,
}));
vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
vi.mock("../../integrations/issues/issueTokenStore", () => ({ getIssueToken: mocks.getToken, saveIssueToken: mocks.saveToken }));
vi.mock("../../integrations/issues/issueProvider", () => ({ createIssueProvider: () => mocks.provider }));
vi.mock("../../plugins/customInputs", () => ({
  DESCRIPTION_INPUT_TARGET: "description",
  getEnabledPluginCustomInputs: (flags: any) => flags.creativeIssueLink ? [{ id: "creative", metadataName: "issue", labelKey: "plugin.creative" }] : [],
}));
vi.mock("../../components/SearchableSelect", () => ({
  default: ({ options, value, onChange, placeholder, disabled }: any) => <select aria-label={placeholder} disabled={disabled} value={value ?? ""} onChange={(e) => onChange(e.target.value || null)}>{options.map((o: any) => <option key={o.value} value={o.value}>{o.label}</option>)}</select>,
}));

const configured = (patch: any = {}) => ({
  ...emptyIssueConfig,
  enabled: true,
  baseUrl: "https://git.test",
  projectPathOrRepo: "group/repo",
  autoInsertUrl: true,
  filterLabels: ["bug"],
  ...patch,
});
const props = (config = configured()) => ({
  settings: { ...defaultSettings, plugins: { conn: { creativeIssueLink: true } }, issueIntegrations: { conn: config } },
  update: vi.fn(), connectionId: "conn", onBack: vi.fn(),
});

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getToken.mockResolvedValue("secret");
  mocks.saveToken.mockResolvedValue(undefined);
  mocks.provider = {
    testConnection: vi.fn().mockResolvedValue({ success: true, count: 4 }),
    fetchLabels: vi.fn().mockResolvedValue([{ name: "bug", color: "#ff0000" }, { name: "feature", color: "#00ff00" }]),
    fetchRepos: vi.fn().mockResolvedValue([{ id: "group/repo", label: "Group / Repo" }, { id: "other", label: "Other" }]),
  };
});
afterEach(cleanup);

describe("IssueIntegrationDetail", () => {
  it("edits provider fields, filters and optional behavior", async () => {
    const user = userEvent.setup();
    const p = props();
    render(<IssueIntegrationDetail {...p} />);
    await waitFor(() => expect(mocks.getToken).toHaveBeenCalledWith("conn"));
    await user.click(screen.getByRole("button", { name: /integrations.github/ }));
    const urlInputs = screen.getAllByRole("textbox");
    fireEvent.change(urlInputs[0], { target: { value: "https://new.test" } });
    const token = document.querySelector('input[type="password"]')!;
    fireEvent.change(token, { target: { value: "new-token" } });
    await user.click(screen.getByRole("button", { name: "common.show" }));
    await user.click(screen.getByRole("button", { name: "integrations.repoLoad" }));
    await waitFor(() => expect(screen.getByLabelText("integrations.projectPathOrRepoSelectPlaceholder")).toBeTruthy());
    await user.selectOptions(screen.getByLabelText("integrations.projectPathOrRepoSelectPlaceholder"), "other");
    await user.click(screen.getByRole("button", { name: "integrations.repoEnterManually" }));

    const selects = screen.getAllByRole("combobox");
    await user.selectOptions(selects.find((s) => Array.from((s as HTMLSelectElement).options).some((o) => o.value === "all"))!, "all");
    for (const toggle of screen.getAllByRole("switch")) await user.click(toggle);
    const target = screen.getAllByRole("combobox").find((s) => Array.from((s as HTMLSelectElement).options).some((o) => o.value === "creative"));
    if (target) await user.selectOptions(target, "creative");
    expect(p.update).toHaveBeenCalledWith("issueIntegrations", expect.objectContaining({ conn: expect.any(Object) }));
  });

  it("tests successfully, loads labels and supports include/exclude selection", async () => {
    const user = userEvent.setup();
    const p = props();
    render(<IssueIntegrationDetail {...p} />);
    await waitFor(() => expect(document.querySelector('input[type="password"]')).toHaveProperty("value", "secret"));
    await user.click(screen.getByRole("button", { name: "integrations.testConnection" }));
    expect(await screen.findByText("integrations.connectionSuccess")).toBeTruthy();
    expect(mocks.saveToken).toHaveBeenCalledWith("conn", "secret");
    expect(await screen.findByRole("button", { name: "feature" })).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "integrations.filterModeExclude" }));
    await user.click(screen.getByRole("button", { name: "feature" }));
    await user.click(screen.getByRole("button", { name: "bug" }));
    await user.click(screen.getByRole("button", { name: "integrations.clearLabels" }));
    expect(p.update).toHaveBeenCalledWith("issueIntegrations", expect.any(Object));
  });

  it("shows provider-declared and thrown connection errors", async () => {
    const user = userEvent.setup();
    mocks.provider.testConnection.mockResolvedValueOnce({ success: false, error: "bad credentials" });
    const { unmount } = render(<IssueIntegrationDetail {...props()} />);
    await waitFor(() => expect(document.querySelector('input[type="password"]')).toHaveProperty("value", "secret"));
    await user.click(screen.getByRole("button", { name: "integrations.testConnection" }));
    expect(await screen.findByText("bad credentials")).toBeTruthy();
    unmount();
    mocks.provider.testConnection.mockRejectedValue(new Error("network"));
    render(<IssueIntegrationDetail {...props()} />);
    await waitFor(() => expect(document.querySelector('input[type="password"]')).toHaveProperty("value", "secret"));
    await user.click(screen.getByRole("button", { name: "integrations.testConnection" }));
    expect(await screen.findByText("integrations.connectionFailed")).toBeTruthy();
  });

  it("falls back to manual repository entry on empty and failed loads", async () => {
    const user = userEvent.setup();
    mocks.provider.fetchRepos.mockResolvedValueOnce([]);
    const { unmount } = render(<IssueIntegrationDetail {...props()} />);
    await waitFor(() => expect(document.querySelector('input[type="password"]')).toHaveProperty("value", "secret"));
    await user.click(screen.getByRole("button", { name: "integrations.repoLoad" }));
    await waitFor(() => expect(screen.getByPlaceholderText("integrations.projectPathOrRepoPlaceholder")).toBeTruthy());
    unmount();
    mocks.provider.fetchRepos.mockRejectedValue(new Error("offline"));
    render(<IssueIntegrationDetail {...props()} />);
    await waitFor(() => expect(document.querySelector('input[type="password"]')).toHaveProperty("value", "secret"));
    await user.click(screen.getByRole("button", { name: "integrations.repoLoad" }));
    await waitFor(() => expect(screen.getByPlaceholderText("integrations.projectPathOrRepoPlaceholder")).toBeTruthy());
  });

  it("handles disabled, GitHub and Gitea variants and missing connection ids", async () => {
    const user = userEvent.setup();
    const disabledProps = props({ ...emptyIssueConfig });
    const { unmount } = render(<IssueIntegrationDetail {...disabledProps} connectionId="" />);
    expect((screen.getByRole("button", { name: "integrations.testConnection" }) as HTMLButtonElement).disabled).toBe(true);
    await user.click(screen.getByRole("button", { name: "integrations.title" }));
    expect(disabledProps.onBack).toHaveBeenCalled();
    unmount();

    const githubProps = props(configured({ provider: "github", autoInsertUrlTarget: "missing" }));
    const { unmount: unmountGithub } = render(<IssueIntegrationDetail {...githubProps} />);
    expect(screen.getByText("integrations.apiBaseUrl")).toBeTruthy();
    expect(screen.queryByText("integrations.syncTime")).toBeNull();
    unmountGithub();

    render(<IssueIntegrationDetail {...props(configured({ provider: "gitea" }))} />);
    expect(screen.getByText("integrations.syncTime")).toBeTruthy();
    expect(screen.queryByText("integrations.showTimeEstimate")).toBeNull();
  });

  it("recovers from token loading failure", async () => {
    mocks.getToken.mockRejectedValue(new Error("store unavailable"));
    render(<IssueIntegrationDetail {...props()} />);
    await waitFor(() => expect(document.querySelector('input[type="password"]')).toHaveProperty("value", ""));
  });
});
