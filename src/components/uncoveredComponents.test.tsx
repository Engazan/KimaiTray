// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { FavoriteTask, RecentTask, TodayEntry } from "../types";
import type { PausedTimerData } from "../api/pauseStore";

const mocks = vi.hoisted(() => ({
  getByLabel: vi.fn(),
  show: vi.fn(),
  setFocus: vi.fn(),
  emitTo: vi.fn(),
  loggerError: vi.fn(),
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, values?: Record<string, unknown>) =>
      values ? `${key}:${JSON.stringify(values)}` : key,
  }),
}));
vi.mock("@tauri-apps/api/window", () => ({
  Window: { getByLabel: mocks.getByLabel },
}));
vi.mock("../utils/logger", () => ({
  logger: { error: mocks.loggerError },
}));
vi.mock("../shared/i18n", () => ({
  default: { t: (key: string) => key },
}));

import TagsList from "./TagsList";
import TagPill from "./TagPill";
import PopupFooterActions from "./PopupFooterActions";
import FavoriteTasksList from "./FavoriteTasksList";
import RecentTasksList from "./RecentTasksList";
import PausedTimerCard from "./PausedTimerCard";
import EmptyTimerState from "./EmptyTimerState";
import HeaderStatus from "./HeaderStatus";
import TodaySection from "./TodaySection";
import { ErrorBanner, UpdateBanner } from "./TrayFeedback";
import { ErrorBoundary } from "./ErrorBoundary";

const favorite: FavoriteTask = {
  key: "1-2",
  connectionId: "connection-a",
  projectId: 1,
  activityId: 2,
  project: "Favorite Project",
  activity: "Development",
  customer: "ACME",
  description: "Build tests",
  tags: ["one", "two", "three"],
  projectColor: "#111111",
  activityColor: "#222222",
  customerColor: "#333333",
};

const recent: RecentTask = {
  key: "1-2",
  projectId: 1,
  activityId: 2,
  timesheetId: 42,
  project: "Recent Project",
  projectColor: "#111111",
  activityColor: "#222222",
  customerColor: "#333333",
  customer: "ACME",
  activity: "Support",
  description: "Fix issue",
  tags: ["urgent"],
  lastUsed: "today",
};

const paused: PausedTimerData = {
  id: "paused-1",
  connectionId: "connection-a",
  projectId: 1,
  activityId: 2,
  project: "Paused Project",
  projectColor: "#111111",
  activityColor: "#222222",
  customerColor: "#333333",
  activity: "Review",
  description: "Review pull request",
  tags: ["review"],
  pausedAt: "2026-08-12T08:00:00Z",
};

const today: TodayEntry = {
  id: 7,
  projectId: 1,
  activityId: 2,
  project: "Today Project",
  projectColor: "#111111",
  activityColor: "#222222",
  customerColor: "#333333",
  customer: "ACME",
  activity: "Testing",
  description: "Coverage",
  tags: ["test"],
  billable: true,
  beginIso: "2026-08-12T08:00:00Z",
  endIso: "2026-08-12T09:00:00Z",
  duration: 3600,
  isRunning: false,
};

describe("previously uncovered tray components", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.getByLabel.mockResolvedValue({
      show: mocks.show,
      setFocus: mocks.setFocus,
      emitTo: mocks.emitTo,
    });
    mocks.show.mockResolvedValue(undefined);
    mocks.setFocus.mockResolvedValue(undefined);
    mocks.emitTo.mockResolvedValue(undefined);
  });

  afterEach(() => cleanup());

  it("renders tag limits and removable tag pills", () => {
    const { container, rerender } = render(<TagsList tags={[]} />);
    expect(container.firstChild).toBeNull();

    rerender(<TagsList tags={["one", "two", "three"]} maxVisible={2} />);
    expect(screen.getByText("one")).toBeTruthy();
    expect(screen.getByText("two")).toBeTruthy();
    expect(screen.queryByText("three")).toBeNull();
    expect(screen.getByText("+1")).toBeTruthy();

    const remove = vi.fn();
    rerender(<TagPill tag="colored" color="#ff0000" onRemove={remove} />);
    fireEvent.click(screen.getByRole("button"));
    expect(remove).toHaveBeenCalledOnce();
    expect(
      (screen.getByText("colored").previousElementSibling as HTMLElement).style
        .backgroundColor,
    ).toBe("rgb(255, 0, 0)");
  });

  it("dispatches footer and feedback banner actions", () => {
    const onNewTask = vi.fn();
    const onSettings = vi.fn();
    const onInstall = vi.fn();
    const onDismiss = vi.fn();
    const { rerender } = render(
      <PopupFooterActions onNewTask={onNewTask} onSettings={onSettings} />,
    );

    fireEvent.click(screen.getByRole("button", { name: "tray.newTask" }));
    fireEvent.click(screen.getByRole("button", { name: "common.settings" }));
    expect(onNewTask).toHaveBeenCalledOnce();
    expect(onSettings).toHaveBeenCalledOnce();

    rerender(<UpdateBanner downloading={false} label="Install 2.0" onInstall={onInstall} />);
    fireEvent.click(screen.getByRole("button", { name: "Install 2.0" }));
    expect(onInstall).toHaveBeenCalledOnce();

    rerender(<UpdateBanner downloading label="Downloading" onInstall={onInstall} />);
    expect((screen.getByRole("button") as HTMLButtonElement).disabled).toBe(true);

    rerender(<ErrorBanner message="Network unavailable" onDismiss={onDismiss} />);
    expect(screen.getByText("Network unavailable")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Dismiss" }));
    expect(onDismiss).toHaveBeenCalledOnce();
  });

  it("renders and operates favorite task items", () => {
    const onStart = vi.fn();
    const onRemove = vi.fn();
    const { container, rerender } = render(
      <FavoriteTasksList tasks={[]} onStart={onStart} onRemove={onRemove} />,
    );
    expect(container.firstChild).toBeNull();

    rerender(
      <FavoriteTasksList
        tasks={[favorite]}
        onStart={onStart}
        onRemove={onRemove}
        startingKey={null}
        colorMode="activity-project"
      />,
    );
    expect(screen.getByText("favorites.title")).toBeTruthy();
    expect(screen.getByText("Favorite Project")).toBeTruthy();
    expect(screen.getByText("ACME · Build tests")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "common.start" }));
    fireEvent.click(
      screen.getByRole("button", { name: "favorites.removeFromFavorites" }),
    );
    expect(onStart).toHaveBeenCalledWith(favorite);
    expect(onRemove).toHaveBeenCalledWith(favorite);
  });

  it("covers recent loading, hidden actions and item workflows", () => {
    const onStart = vi.fn();
    const onHide = vi.fn();
    const onDelete = vi.fn();
    const onToggleFavorite = vi.fn();
    const onShowAll = vi.fn();
    const { rerender } = render(
      <RecentTasksList
        tasks={[]}
        onStart={onStart}
        onHide={onHide}
        onDelete={onDelete}
        isLoading
      />,
    );
    expect(screen.getByText("tray.recentTasks")).toBeTruthy();

    rerender(
      <RecentTasksList
        tasks={[recent]}
        onStart={onStart}
        onHide={onHide}
        onDelete={onDelete}
        onToggleFavorite={onToggleFavorite}
        isFavorite={() => false}
        hiddenCount={2}
        onShowAll={onShowAll}
      />,
    );
    fireEvent.click(screen.getByText(/recentActions.hiddenCount/));
    fireEvent.click(screen.getByRole("button", { name: "favorites.addToFavorites" }));
    fireEvent.click(screen.getByRole("button", { name: "recentActions.hideFromRecents" }));
    fireEvent.click(screen.getByRole("button", { name: "common.start" }));
    fireEvent.click(screen.getByRole("button", { name: "recentActions.deleteFromKimai" }));
    expect(screen.getByText("recentActions.confirmDelete")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "common.delete" }));

    expect(onShowAll).toHaveBeenCalledOnce();
    expect(onToggleFavorite).toHaveBeenCalledWith(recent);
    expect(onHide).toHaveBeenCalledWith(recent);
    expect(onStart).toHaveBeenCalledWith(recent);
    expect(onDelete).toHaveBeenCalledWith(recent);
  });

  it("allows cancelling recent deletion and supports a headerless hidden action", () => {
    const onShowAll = vi.fn();
    const { rerender } = render(
      <RecentTasksList
        tasks={[recent]}
        onStart={vi.fn()}
        onHide={vi.fn()}
        onDelete={vi.fn()}
        hiddenCount={1}
        onShowAll={onShowAll}
        showHeader={false}
      />,
    );
    fireEvent.click(screen.getByText(/recentActions.hiddenCount/));
    expect(onShowAll).toHaveBeenCalledOnce();

    fireEvent.click(screen.getByRole("button", { name: "recentActions.deleteFromKimai" }));
    fireEvent.click(screen.getByRole("button", { name: "common.cancel" }));
    expect(screen.queryByText("recentActions.confirmDelete")).toBeNull();

    rerender(
      <RecentTasksList
        tasks={[]}
        onStart={vi.fn()}
        onHide={vi.fn()}
        onDelete={vi.fn()}
      />,
    );
    expect(screen.queryByText("tray.recentTasks")).toBeNull();
  });

  it("operates full and compact paused timer cards", () => {
    const onResume = vi.fn();
    const onStop = vi.fn();
    const onDismissError = vi.fn();
    const { rerender } = render(
      <PausedTimerCard
        paused={paused}
        onResume={onResume}
        onStop={onStop}
        error="Resume failed"
        onDismissError={onDismissError}
      />,
    );
    expect(screen.getByText("Paused Project")).toBeTruthy();
    expect(screen.getByText("Review pull request")).toBeTruthy();
    expect(screen.getByText("Resume failed")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "pause.resume" }));
    fireEvent.click(screen.getByRole("button", { name: "timer.stopTimer" }));
    fireEvent.click(screen.getByRole("button", { name: "common.dismiss" }));
    expect(onResume).toHaveBeenCalledOnce();
    expect(onStop).toHaveBeenCalledOnce();
    expect(onDismissError).toHaveBeenCalledOnce();

    rerender(
      <PausedTimerCard
        paused={paused}
        onResume={onResume}
        onStop={onStop}
        compact
        showDescriptionOnHover
        isResuming
      />,
    );
    expect(screen.getByTitle("Review pull request")).toBeTruthy();
    expect(
      (screen.getByRole("button", { name: "pause.resume" }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);
    expect(
      (screen.getByRole("button", { name: "timer.stopTimer" }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);
  });

  it.each([
    ["loading", "common.loading"],
    ["empty", "tray.noActiveTimer"],
    ["unconfigured", "tray.setupConnection"],
  ] as const)("renders the compact %s empty-timer state", (variant, label) => {
    render(<EmptyTimerState compact variant={variant} />);
    expect(screen.getByText(label)).toBeTruthy();
  });

  it("opens and focuses connection settings from the empty state", async () => {
    render(<EmptyTimerState variant="unconfigured" />);
    fireEvent.click(screen.getByRole("button", { name: "tray.setupConnection" }));

    await vi.waitFor(() => expect(mocks.show).toHaveBeenCalledOnce());
    expect(mocks.setFocus).toHaveBeenCalledOnce();
    expect(mocks.emitTo).toHaveBeenCalledWith(
      "settings",
      "kimai://navigate-section",
      "connection",
    );
  });

  it("shows connection status, opens Kimai and switches accounts", async () => {
    const onOpenKimai = vi.fn();
    const onSwitchConnection = vi.fn().mockResolvedValue(undefined);
    render(
      <HeaderStatus
        status="error"
        errorMessage="Authentication failed"
        connections={[
          { id: "a", name: "Primary", url: "https://a.test" },
          { id: "b", name: "Secondary", url: "https://b.test" },
        ]}
        activeConnectionId="a"
        onSwitchConnection={onSwitchConnection}
        showOpenKimai
        onOpenKimai={onOpenKimai}
      />,
    );

    expect(screen.getByRole("img", { name: "Authentication failed" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "common.openKimai" }));
    fireEvent.click(screen.getByRole("button", { name: /Primary/ }));
    expect(screen.getByRole("listbox")).toBeTruthy();
    fireEvent.click(screen.getByRole("option", { name: /Secondary/ }));

    expect(onOpenKimai).toHaveBeenCalledOnce();
    expect(onSwitchConnection).toHaveBeenCalledWith("b");
    expect(screen.queryByRole("listbox")).toBeNull();
  });

  it("renders Today loading, error, empty and populated actions", () => {
    const onRetry = vi.fn();
    const onToggleSort = vi.fn();
    const onToggleExpand = vi.fn();
    const onEditEntry = vi.fn();
    const base = {
      entries: [] as TodayEntry[],
      totalCount: 0,
      totalDuration: 0,
      hasMore: false,
      expanded: false,
      onToggleExpand,
      sortAsc: false,
      onToggleSort,
      isLoading: true,
      isError: false,
      onRetry,
    };
    const { rerender } = render(<TodaySection {...base} />);
    expect(screen.getByText("today.title")).toBeTruthy();

    rerender(<TodaySection {...base} isLoading={false} isError />);
    fireEvent.click(screen.getByRole("button", { name: "common.retry" }));
    expect(onRetry).toHaveBeenCalledOnce();

    rerender(<TodaySection {...base} isLoading={false} />);
    expect(screen.getByText("today.empty")).toBeTruthy();

    rerender(
      <TodaySection
        {...base}
        entries={[today]}
        totalCount={7}
        totalDuration={3600}
        hasMore
        isLoading={false}
        onEditEntry={onEditEntry}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "today.oldestFirst" }));
    fireEvent.click(screen.getByRole("button", { name: /today.showAll/ }));
    expect(onToggleSort).toHaveBeenCalledOnce();
    expect(onToggleExpand).toHaveBeenCalledOnce();
    expect(screen.getByText("Today Project")).toBeTruthy();
  });

  it("catches render failures, logs them and offers reload", () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    function Broken(): never {
      throw new Error("render exploded");
    }

    render(
      <ErrorBoundary>
        <Broken />
      </ErrorBoundary>,
    );

    expect(screen.getByText("common.somethingWentWrong")).toBeTruthy();
    expect(screen.getByText("render exploded")).toBeTruthy();
    expect(screen.getByRole("button", { name: "common.reload" })).toBeTruthy();
    expect(mocks.loggerError).toHaveBeenCalledWith(
      expect.stringContaining("Uncaught error: render exploded"),
    );
    consoleError.mockRestore();
  });
});
