// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { FavoriteTask, RecentTask } from "../types";
import RecentTaskItem from "./RecentTaskItem";
import FavoriteTaskItem from "./FavoriteTaskItem";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));
vi.mock("./contextMenu", () => ({ showContextMenu: vi.fn(), separator: () => ({ kind: "separator" }) }));

afterEach(() => cleanup());

const base = {
  key: "1-2", projectId: 1, activityId: 2, project: "Nav Project", activity: "Work", customer: "",
  description: "", tags: [], projectColor: "", activityColor: "", customerColor: "",
};
const recent = { ...base, timesheetId: 5, lastUsed: "1h" } as RecentTask;
const favorite = base as FavoriteTask;

describe("navigable task rows", () => {
  it.each([
    ["recent", (props: { onStartWithChanges?: () => void; disabled?: boolean }) => (
      <RecentTaskItem task={recent} onStart={vi.fn()} onHide={vi.fn()} onDelete={vi.fn()} {...props} />
    )],
    ["favorite", (props: { onStartWithChanges?: () => void; disabled?: boolean }) => (
      <FavoriteTaskItem task={favorite} onStart={vi.fn()} onRemove={vi.fn()} {...props} />
    )],
  ])("starts a %s task with changes on Shift+Enter", (_, renderRow) => {
    const onStartWithChanges = vi.fn();
    const { rerender } = render(renderRow({ onStartWithChanges }));
    const row = document.querySelector<HTMLElement>("[data-nav-item]")!;
    expect(screen.getByRole("listitem")).toBeTruthy();

    fireEvent.keyDown(row, { key: "Enter" });
    expect(onStartWithChanges).not.toHaveBeenCalled();
    fireEvent.keyDown(row, { key: "Enter", shiftKey: true });
    expect(onStartWithChanges).toHaveBeenCalledOnce();

    rerender(renderRow({ onStartWithChanges, disabled: true }));
    fireEvent.keyDown(row, { key: "Enter", shiftKey: true });
    rerender(renderRow({}));
    fireEvent.keyDown(row, { key: "Enter", shiftKey: true });
    expect(onStartWithChanges).toHaveBeenCalledOnce();
  });
});
