// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import CategoryModePanel from "./CategoryModePanel";

const mocks = vi.hoisted(() => ({
  config: {
    defaultProjectId: 10,
    continueWindowMinutes: 15,
    categories: [],
  } as any,
  mappingLoading: false,
  has: vi.fn(),
  resolve: vi.fn(),
  remoteSync: vi.fn(),
  loadLast: vi.fn(),
  saveLast: vi.fn(),
  projects: [] as any[],
  projectsLoading: false,
  getProjects: vi.fn(),
}));

vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
vi.mock("./useCategoryConfig", () => ({ useCategoryConfig: () => ({ config: mocks.config }) }));
vi.mock("./useCategoryActivityMapping", () => ({
  useCategoryActivityMapping: () => ({ isLoading: mocks.mappingLoading, has: mocks.has, resolve: mocks.resolve }),
}));
vi.mock("./useCategoryRemoteSync", () => ({ useCategoryRemoteSync: (...args: unknown[]) => mocks.remoteSync(...args) }));
vi.mock("./categoryLastActivityStore", () => ({
  loadCategoryLastActivity: mocks.loadLast,
  saveCategoryLastActivity: mocks.saveLast,
}));
vi.mock("../api/projectApi", () => ({ getProjects: mocks.getProjects }));
vi.mock("@tanstack/react-query", () => ({ useQuery: ({ queryFn, enabled }: any) => { if (enabled) void queryFn(); return { data: mocks.projects, isLoading: mocks.projectsLoading }; } }));
vi.mock("./CategoryButton", () => ({
  default: ({ label, sublabel, onClick, disabled, isStarting }: any) => (
    <button type="button" onClick={onClick} disabled={disabled} data-starting={isStarting ? "yes" : "no"}>
      {label}{sublabel ? `:${sublabel}` : ""}
    </button>
  ),
}));

const categories = [{
  id: "cat",
  label: "Work",
  icon: "briefcase",
  color: "blue",
  children: [
    { id: "direct", label: "Direct", activityName: "DirectActivity", requiresProject: false, tags: ["one"] },
    { id: "project", label: "Project task", activityName: "ProjectActivity", requiresProject: true },
    { id: "missing", label: "Missing", activityName: "MissingActivity", requiresProject: false },
    { id: "scoped", label: "Wrong scope", activityName: "ScopedActivity", requiresProject: false },
  ],
}];

beforeEach(() => {
  vi.clearAllMocks();
  mocks.config = { defaultProjectId: 10, continueWindowMinutes: 15, categories, sourceUrl: undefined };
  mocks.mappingLoading = false;
  mocks.projectsLoading = false;
  mocks.projects = [
    { id: 10, name: "Alpha", visible: true },
    { id: 11, name: "Beta Project", visible: true },
    { id: 12, name: "Hidden", visible: false },
  ];
  mocks.has.mockImplementation((name: string) => name !== "MissingActivity");
  mocks.resolve.mockImplementation((name: string, projectId: number) => {
    if (name === "DirectActivity" && projectId === 10) return 101;
    if (name === "ProjectActivity" && projectId === 11) return 202;
    return null;
  });
  mocks.loadLast.mockResolvedValue(null);
  mocks.saveLast.mockResolvedValue(undefined);
  mocks.getProjects.mockResolvedValue([]);
});
afterEach(cleanup);

const props = (startTask = vi.fn().mockResolvedValue({ id: 999 })) => ({
  client: { cacheScope: "conn" } as any,
  connectionId: "conn",
  hasActiveTimer: false,
  startTask,
  startingKey: null,
  disabled: false,
});

describe("CategoryModePanel", () => {
  it("drills down and starts a leaf with the configured default project", async () => {
    const user = userEvent.setup();
    const startTask = vi.fn().mockResolvedValue({ id: 999 });
    render(<CategoryModePanel {...props(startTask)} />);
    expect(mocks.remoteSync).toHaveBeenCalledWith("conn", undefined);
    await user.click(screen.getByRole("button", { name: "Work" }));
    await user.click(screen.getByRole("button", { name: "Direct" }));
    await waitFor(() => expect(startTask).toHaveBeenCalledWith({
      projectId: 10, activityId: 101, tags: ["one"], label: "Direct",
    }, "direct"));
    expect(mocks.saveLast).toHaveBeenCalledWith("conn", expect.objectContaining({ leafId: "direct", stoppedAt: undefined }));
    expect(await screen.findByText("categoryMode.prompt")).toBeTruthy();
  });

  it("marks missing, unresolvable and default-project-dependent leaves disabled", async () => {
    const user = userEvent.setup();
    const { unmount } = render(<CategoryModePanel {...props()} />);
    await user.click(screen.getByRole("button", { name: "Work" }));
    expect((screen.getByRole("button", { name: "Missing:categoryMode.activityMissing" }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole("button", { name: "Wrong scope:categoryMode.activityMissing" }) as HTMLButtonElement).disabled).toBe(true);
    unmount();

    mocks.config = { ...mocks.config, defaultProjectId: null };
    render(<CategoryModePanel {...props()} />);
    await user.click(screen.getByRole("button", { name: "Work" }));
    expect((screen.getByRole("button", { name: "Direct:categoryMode.defaultProjectMissing" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("selects and filters valid projects for project-required leaves", async () => {
    const user = userEvent.setup();
    const startTask = vi.fn().mockResolvedValue({ id: 1 });
    render(<CategoryModePanel {...props(startTask)} startingKey="project" />);
    await user.click(screen.getByRole("button", { name: "Work" }));
    await user.click(screen.getByRole("button", { name: "Project task" }));
    expect(screen.queryByRole("button", { name: "Alpha" })).toBeNull();
    expect(screen.getByRole("button", { name: "Beta Project" }).dataset.starting).toBe("yes");
    fireEvent.change(screen.getByPlaceholderText("categoryMode.searchProject"), { target: { value: "beta" } });
    await user.click(screen.getByRole("button", { name: "Beta Project" }));
    await waitFor(() => expect(startTask).toHaveBeenCalledWith({ projectId: 11, activityId: 202, tags: undefined, label: "Project task" }, "project"));
  });

  it("returns from project and category views with header back buttons", async () => {
    const user = userEvent.setup();
    render(<CategoryModePanel {...props()} />);
    await user.click(screen.getByRole("button", { name: "Work" }));
    await user.click(screen.getByRole("button", { name: "Project task" }));
    await user.click(screen.getByRole("button", { name: "" }));
    expect(screen.getByRole("button", { name: "Project task" })).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "" }));
    expect(screen.getByRole("button", { name: "Work" })).toBeTruthy();
  });

  it("offers a recent stopped activity and records a successful continuation", async () => {
    const user = userEvent.setup();
    const last = { leafId: "last", label: "Previous", projectId: 11, activityId: 202, tags: ["tag"], startedAt: 1, stoppedAt: Math.floor(Date.now() / 1000) - 30 };
    mocks.loadLast.mockResolvedValue(last);
    const startTask = vi.fn().mockResolvedValue({ id: 1 });
    render(<CategoryModePanel {...props(startTask)} startingKey="last" />);
    const button = await screen.findByRole("button", { name: "categoryMode.continueLast" });
    expect(button.dataset.starting).toBe("yes");
    await user.click(button);
    await waitFor(() => expect(startTask).toHaveBeenCalledWith({ projectId: 11, activityId: 202, tags: ["tag"], label: "Previous" }, "last"));
    expect(mocks.saveLast).toHaveBeenCalledWith("conn", expect.objectContaining({ stoppedAt: undefined }));
  });

  it("does not continue expired, running, active-timer or failed activities", async () => {
    mocks.loadLast.mockResolvedValue({ leafId: "old", label: "Old", projectId: 1, activityId: 2, startedAt: 1, stoppedAt: 1 });
    const { unmount } = render(<CategoryModePanel {...props()} />);
    await waitFor(() => expect(mocks.loadLast).toHaveBeenCalled());
    expect(screen.queryByRole("button", { name: "categoryMode.continueLast" })).toBeNull();
    unmount();

    mocks.loadLast.mockResolvedValue({ leafId: "running", label: "Running", projectId: 1, activityId: 2, startedAt: 1 });
    render(<CategoryModePanel {...props()} hasActiveTimer />);
    await waitFor(() => expect(mocks.loadLast).toHaveBeenCalledTimes(2));
    expect(screen.queryByRole("button", { name: "categoryMode.continueLast" })).toBeNull();
  });

  it("stamps the stop time when an active timer becomes inactive", async () => {
    const running = { leafId: "last", label: "Last", projectId: 10, activityId: 101, startedAt: 1 };
    mocks.loadLast.mockResolvedValue(running);
    const { rerender } = render(<CategoryModePanel {...props()} hasActiveTimer />);
    await waitFor(() => expect(mocks.loadLast).toHaveBeenCalled());
    rerender(<CategoryModePanel {...props()} hasActiveTimer={false} />);
    await waitFor(() => expect(mocks.saveLast).toHaveBeenCalledWith("conn", expect.objectContaining({ stoppedAt: expect.any(Number) })));
  });

  it("shows empty, loading and no-project states", async () => {
    const user = userEvent.setup();
    mocks.config = { ...mocks.config, categories: [] };
    const { unmount } = render(<CategoryModePanel {...props()} disabled />);
    expect(screen.getByText("categoryMode.noCategories")).toBeTruthy();
    unmount();

    mocks.config = { ...mocks.config, categories };
    mocks.projectsLoading = true;
    const { unmount: unmountLoading } = render(<CategoryModePanel {...props()} />);
    await user.click(screen.getByRole("button", { name: "Work" }));
    await user.click(screen.getByRole("button", { name: "Project task" }));
    expect(screen.getByText("common.loading")).toBeTruthy();
    unmountLoading();

    mocks.projectsLoading = false;
    mocks.projects = [];
    render(<CategoryModePanel {...props()} />);
    await user.click(screen.getByRole("button", { name: "Work" }));
    await user.click(screen.getByRole("button", { name: "Project task" }));
    expect(screen.getByText("categoryMode.noProjects")).toBeTruthy();
  });

  it("does not record unresolved or failed starts", async () => {
    const user = userEvent.setup();
    const failedStart = vi.fn().mockResolvedValue(null);
    const { unmount } = render(<CategoryModePanel {...props(failedStart)} />);
    await user.click(screen.getByRole("button", { name: "Work" }));
    await user.click(screen.getByRole("button", { name: "Direct" }));
    await waitFor(() => expect(failedStart).toHaveBeenCalled());
    expect(mocks.saveLast).not.toHaveBeenCalled();
    unmount();

    let directCalls = 0;
    mocks.resolve.mockImplementation((name: string, projectId: number) => {
      if (name === "DirectActivity" && projectId === 10) return directCalls++ === 0 ? 101 : null;
      return name === "ProjectActivity" && projectId === 11 ? 202 : null;
    });
    const startTask = vi.fn();
    render(<CategoryModePanel {...props(startTask)} />);
    await user.click(screen.getByRole("button", { name: "Work" }));
    await user.click(screen.getByRole("button", { name: "Direct" }));
    expect(startTask).not.toHaveBeenCalled();
  });
});
