// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CategoryConfig } from "./types";
import CategoryModeSettingsSection from "./CategoryModeSettingsSection";

const mocks = vi.hoisted(() => ({
  config: {} as CategoryConfig,
  loaded: true,
  updateConfig: vi.fn(),
  getConnectionToken: vi.fn(),
  createKimaiClient: vi.fn(),
  fetchRemoteCategoryConfig: vi.fn(),
  clipboardWrite: vi.fn(),
  activities: [
    { id: 1, name: "Development" },
    { id: 2, name: "Development" },
    { id: 3, name: "Meetings" },
  ],
  projects: [
    { id: 10, name: "Visible", visible: true },
    { id: 11, name: "Hidden", visible: false },
  ],
  loading: false,
  getActivities: vi.fn(),
  getProjects: vi.fn(),
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));
vi.mock("./useCategoryConfig", () => ({
  useCategoryConfig: () => ({ config: mocks.config, loaded: mocks.loaded, updateConfig: mocks.updateConfig }),
}));
vi.mock("../api/connectionTokenStore", () => ({ getConnectionToken: mocks.getConnectionToken }));
vi.mock("../api/kimaiClient", () => ({ createKimaiClient: mocks.createKimaiClient }));
vi.mock("../api/activityApi", () => ({ getActivities: mocks.getActivities }));
vi.mock("../api/projectApi", () => ({ getProjects: mocks.getProjects }));
vi.mock("./categoryRemoteSource", () => ({ fetchRemoteCategoryConfig: mocks.fetchRemoteCategoryConfig }));
vi.mock("@tanstack/react-query", () => ({
  useQuery: ({ queryKey, queryFn, enabled }: { queryKey: string[]; queryFn: () => unknown; enabled: boolean }) => {
    if (enabled) void queryFn();
    return queryKey[0] === "activities"
      ? { data: mocks.activities, isLoading: mocks.loading }
      : { data: mocks.projects, isLoading: mocks.loading };
  },
}));
vi.mock("../components/SearchableSelect", () => ({
  default: ({ options, value, onChange, placeholder, allowEmpty }: {
    options: Array<{ value: string | number; label: string }>;
    value: string | number | null;
    onChange: (value: never) => void;
    placeholder: string;
    allowEmpty?: boolean;
  }) => (
    <select aria-label={placeholder} value={value ?? ""} onChange={(event) => onChange((event.target.value ? (Number.isNaN(Number(event.target.value)) ? event.target.value : Number(event.target.value)) : null) as never)}>
      {allowEmpty && <option value="">empty</option>}
      {options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
    </select>
  ),
}));

const baseConfig = (): CategoryConfig => ({
  defaultProjectId: 10,
  continueWindowMinutes: 15,
  categories: [
    {
      id: "cat-a",
      label: "Work",
      icon: "briefcase",
      color: "blue",
      children: [{
        id: "leaf-a",
        label: "Coding",
        activityName: "Legacy activity",
        requiresProject: false,
        tags: ["code"],
      }],
    },
    { id: "cat-b", label: "Admin", children: [] },
  ],
});

beforeEach(() => {
  vi.clearAllMocks();
  mocks.config = baseConfig();
  mocks.loaded = true;
  mocks.loading = false;
  mocks.activities = [
    { id: 1, name: "Development" },
    { id: 2, name: "Development" },
    { id: 3, name: "Meetings" },
  ];
  mocks.projects = [
    { id: 10, name: "Visible", visible: true },
    { id: 11, name: "Hidden", visible: false },
  ];
  mocks.getConnectionToken.mockResolvedValue("token");
  mocks.createKimaiClient.mockReturnValue({ cacheScope: "conn" });
  mocks.getActivities.mockResolvedValue([]);
  mocks.getProjects.mockResolvedValue([]);
  mocks.fetchRemoteCategoryConfig.mockResolvedValue(null);
  Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: mocks.clipboardWrite } });
  mocks.clipboardWrite.mockResolvedValue(undefined);
});
afterEach(cleanup);

describe("CategoryModeSettingsSection", () => {
  it("asks the user to save a connection first", () => {
    render(<CategoryModeSettingsSection connectionId="" url="" />);
    expect(screen.getByText("categoryMode.noConnection")).toBeTruthy();
  });

  it("edits behavior, categories, leaves and visual metadata", async () => {
    const user = userEvent.setup();
    render(<CategoryModeSettingsSection connectionId="conn" url="https://kimai.test" name="Kimai" />);
    await waitFor(() => expect(mocks.createKimaiClient).toHaveBeenCalledWith("https://kimai.test", "token", "conn"));

    await user.selectOptions(screen.getByLabelText("categoryMode.selectDefaultProject"), "10");
    fireEvent.change(screen.getByRole("spinbutton"), { target: { value: "999" } });
    expect(mocks.updateConfig).toHaveBeenCalledWith(expect.objectContaining({ continueWindowMinutes: 240 }));

    const categoryNames = screen.getAllByPlaceholderText("categoryMode.categoryNamePlaceholder");
    fireEvent.change(categoryNames[0], { target: { value: "Client work" } });
    const leafName = screen.getByPlaceholderText("categoryMode.leafNamePlaceholder");
    fireEvent.change(leafName, { target: { value: "Implementation" } });
    await user.selectOptions(screen.getByLabelText("categoryMode.selectActivity"), "Meetings");
    await user.click(screen.getAllByRole("switch")[1]);

    await user.click(screen.getAllByRole("button", { name: "categoryMode.editVisual" })[0]);
    await user.click(screen.getAllByRole("button", { name: "categoryMode.iconOption" })[0]);
    await user.click(screen.getAllByRole("button", { name: "categoryMode.colorOption" })[0]);
    await user.click(screen.getByRole("button", { name: "categoryMode.noIcon" }));
    await user.click(screen.getByRole("button", { name: "categoryMode.noColor" }));
    fireEvent.mouseDown(document.body);
    expect(screen.queryByRole("dialog", { name: "categoryMode.editVisual" })).toBeNull();

    await user.click(screen.getAllByRole("button", { name: "categoryMode.moveDown" })[0]);
    await user.click(screen.getAllByRole("button", { name: "categoryMode.moveUp" })[1]);
    await user.click(screen.getAllByRole("button", { name: "categoryMode.addLeaf" })[1]);
    await user.click(screen.getByRole("button", { name: "categoryMode.addCategory" }));

    expect(mocks.updateConfig).toHaveBeenCalledWith(expect.objectContaining({ categories: expect.any(Array) }));
    expect(mocks.updateConfig.mock.calls.some(([value]) => value.categories.some((category: { label: string }) => category.label === "Client work"))).toBe(true);
    expect(mocks.updateConfig.mock.calls.some(([value]) => value.categories.some((category: { children: Array<{ activityName: string }> }) => category.children.some((leaf) => leaf.activityName === "Meetings")))).toBe(true);
  });

  it("uses two-step deletion, reset and JSON import/export", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const user = userEvent.setup();
    const writeText = vi.spyOn(navigator.clipboard, "writeText").mockResolvedValue(undefined);
    render(<CategoryModeSettingsSection connectionId="conn" url="https://kimai.test" />);

    await user.click(screen.getByRole("button", { name: "categoryMode.deleteLeaf" }));
    await user.click(screen.getByRole("button", { name: "categoryMode.confirmDelete" }));
    expect(mocks.updateConfig).toHaveBeenCalledWith(expect.objectContaining({
      categories: expect.arrayContaining([expect.objectContaining({ id: "cat-a", children: [] })]),
    }));

    await user.click(screen.getAllByRole("button", { name: "categoryMode.deleteCategory" })[0]);
    await user.click(screen.getByRole("button", { name: "categoryMode.confirmDelete" }));
    expect(mocks.updateConfig).toHaveBeenCalledWith(expect.objectContaining({ categories: [expect.objectContaining({ id: "cat-b" })] }));

    await user.click(screen.getByRole("button", { name: "categoryMode.exportJson" }));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith(expect.stringContaining("cat-a")));
    expect(screen.getByRole("button", { name: "categoryMode.copied" })).toBeTruthy();
    await vi.advanceTimersByTimeAsync(1500);

    await user.click(screen.getByRole("button", { name: "categoryMode.importJson" }));
    const textarea = document.querySelector("textarea")!;
    fireEvent.change(textarea, { target: { value: "{" } });
    await user.click(screen.getByRole("button", { name: "categoryMode.applyJson" }));
    expect(screen.getByText("categoryMode.jsonInvalid")).toBeTruthy();
    fireEvent.change(textarea, { target: { value: JSON.stringify({ categories: [], internalProjectId: 42 }) } });
    await user.click(screen.getByRole("button", { name: "categoryMode.applyJson" }));
    expect(mocks.updateConfig).toHaveBeenCalledWith({ categories: [], defaultProjectId: 42, continueWindowMinutes: 15 });

    await user.click(screen.getByRole("button", { name: "categoryMode.importJson" }));
    fireEvent.change(document.querySelector("textarea")!, { target: { value: JSON.stringify({ categories: [], defaultProjectId: 7, continueWindowMinutes: 22 }) } });
    await user.click(screen.getByRole("button", { name: "categoryMode.applyJson" }));
    expect(mocks.updateConfig).toHaveBeenCalledWith({ categories: [], defaultProjectId: 7, continueWindowMinutes: 22 });

    await user.click(screen.getByRole("button", { name: "categoryMode.resetDefault" }));
    await user.click(screen.getByRole("button", { name: "categoryMode.resetConfirm" }));
    expect(mocks.updateConfig).toHaveBeenCalledWith(expect.objectContaining({ categories: expect.any(Array) }));
    vi.useRealTimers();
  });

  it("shows empty and loading states and falls back to manual activity input", () => {
    mocks.config = { ...baseConfig(), categories: [] };
    mocks.activities = [];
    mocks.projects = [];
    render(<CategoryModeSettingsSection connectionId="conn" url="" />);
    expect(screen.getByText("categoryMode.activitiesUnavailable")).toBeTruthy();
    expect(screen.getByText("categoryMode.noCategoriesEditor")).toBeTruthy();
  });

  it("syncs URL-managed categories and reports remote failures", async () => {
    const user = userEvent.setup();
    mocks.config = { ...baseConfig(), sourceUrl: " https://config.test/categories.json ", sourceSyncedAt: 100 };
    const remote = { categories: [{ id: "remote", label: "Remote", children: [] }], continueWindowMinutes: 30 };
    mocks.fetchRemoteCategoryConfig.mockResolvedValueOnce(remote).mockResolvedValueOnce(null);
    render(<CategoryModeSettingsSection connectionId="conn" url="https://kimai.test" />);

    expect(screen.getByText("categoryMode.lastSynced")).toBeTruthy();
    fireEvent.change(screen.getByPlaceholderText("categoryMode.sourceUrlPlaceholder"), { target: { value: "https://new.test/config" } });
    await user.click(screen.getByRole("button", { name: "categoryMode.syncNow" }));
    await waitFor(() => expect(mocks.updateConfig).toHaveBeenCalledWith(expect.objectContaining({
      categories: remote.categories, continueWindowMinutes: 30, sourceSyncedAt: expect.any(Number),
    })));
    await user.click(screen.getByRole("button", { name: "categoryMode.syncNow" }));
    expect(await screen.findByText("categoryMode.syncFailed")).toBeTruthy();
    await user.click(screen.getByRole("switch"));
    expect(mocks.updateConfig).toHaveBeenCalledWith(expect.objectContaining({ sourceUrl: undefined, sourceSyncedAt: undefined }));
  });

  it("handles an empty remote URL and unavailable token", async () => {
    const user = userEvent.setup();
    mocks.config = { ...baseConfig(), sourceUrl: "" };
    mocks.getConnectionToken.mockRejectedValue(new Error("missing"));
    render(<CategoryModeSettingsSection connectionId="conn" url="https://kimai.test" />);
    expect(screen.getByText("categoryMode.remoteManaged")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "categoryMode.syncNow" })).toBeNull();
    await user.click(screen.getByRole("switch"));
    await waitFor(() => expect(mocks.getConnectionToken).toHaveBeenCalled());
  });

  it("validates parsed JSON, resets confirmation on blur and edits manual activities", async () => {
    const user = userEvent.setup();
    mocks.activities = [];
    render(<CategoryModeSettingsSection connectionId="conn" url="https://kimai.test" />);
    await waitFor(() => expect(mocks.getActivities).toHaveBeenCalled());
    fireEvent.change(screen.getByPlaceholderText("categoryMode.activityNamePlaceholder"), { target: { value: "Manual" } });
    expect(mocks.updateConfig).toHaveBeenCalledWith(expect.objectContaining({
      categories: expect.arrayContaining([expect.objectContaining({ children: expect.arrayContaining([expect.objectContaining({ activityName: "Manual" })]) })]),
    }));

    await user.click(screen.getByRole("button", { name: "categoryMode.importJson" }));
    fireEvent.change(document.querySelector("textarea")!, { target: { value: "null" } });
    await user.click(screen.getByRole("button", { name: "categoryMode.applyJson" }));
    expect(screen.getByText("categoryMode.jsonInvalid")).toBeTruthy();

    const reset = screen.getByRole("button", { name: "categoryMode.resetDefault" });
    await user.click(reset);
    expect(screen.getByRole("button", { name: "categoryMode.resetConfirm" })).toBeTruthy();
    fireEvent.blur(screen.getByRole("button", { name: "categoryMode.resetConfirm" }));
    expect(screen.getByRole("button", { name: "categoryMode.resetDefault" })).toBeTruthy();
  });
});
