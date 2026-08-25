// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  newMenu: vi.fn(),
  popup: vi.fn(),
  close: vi.fn(),
  error: vi.fn(),
}));

vi.mock("@tauri-apps/api/menu", () => ({
  Menu: { new: mocks.newMenu },
}));
vi.mock("@tauri-apps/api/dpi", () => ({
  LogicalPosition: class LogicalPosition {
    constructor(public x: number, public y: number) {}
  },
}));
vi.mock("../utils/logger", () => ({ logger: { error: mocks.error } }));

import {
  isEditableContextTarget,
  separator,
  showContextMenu,
  textEditingMenu,
} from "./contextMenu";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.newMenu.mockResolvedValue({ popup: mocks.popup, close: mocks.close });
  mocks.popup.mockResolvedValue(undefined);
  mocks.close.mockResolvedValue(undefined);
  document.body.innerHTML = "";
});

describe("native context menus", () => {
  it("builds nested, predefined and action items at the pointer position", async () => {
    const event = {
      clientX: 12,
      clientY: 34,
      preventDefault: vi.fn(),
      stopPropagation: vi.fn(),
    } as unknown as MouseEvent;
    const action = vi.fn();

    await showContextMenu(event, [
      { text: "Run", action },
      separator(),
      { kind: "submenu", text: "Switch", items: [{ text: "Other", action }] },
    ]);

    expect(event.preventDefault).toHaveBeenCalled();
    expect(event.stopPropagation).toHaveBeenCalled();
    expect(mocks.newMenu).toHaveBeenCalledOnce();
    const items = mocks.newMenu.mock.calls[0][0].items;
    expect(items[0]).toMatchObject({ text: "Run" });
    expect(items[0].action).toEqual(expect.any(Function));
    expect(items[1]).toEqual({ item: "Separator" });
    expect(items[2]).toMatchObject({ text: "Switch", items: [expect.objectContaining({ text: "Other" })] });
    expect(mocks.popup).toHaveBeenCalledWith(expect.objectContaining({ x: 12, y: 34 }));
    expect(mocks.close).not.toHaveBeenCalled();
    mocks.close.mockRejectedValueOnce(new Error("already closed"));
    items[0].action("run");
    await new Promise((resolve) => window.setTimeout(resolve, 0));
    expect(action).toHaveBeenCalledWith("run");
    expect(mocks.close).toHaveBeenCalled();
    // A stale native callback can arrive after its menu resource was released.
    items[0].action("stale");
    await new Promise((resolve) => window.setTimeout(resolve, 0));
    expect(action).toHaveBeenCalledWith("stale");
  });

  it("does not allocate a native menu for an empty action list", async () => {
    const event = {
      preventDefault: vi.fn(),
      stopPropagation: vi.fn(),
    } as unknown as MouseEvent;
    await showContextMenu(event, []);
    expect(mocks.newMenu).not.toHaveBeenCalled();
  });

  it("releases a dismissed menu before opening the next one", async () => {
    const firstClose = vi.fn().mockRejectedValue(new Error("already closed"));
    mocks.newMenu
      .mockResolvedValueOnce({ popup: mocks.popup, close: firstClose })
      .mockResolvedValueOnce({ popup: mocks.popup, close: mocks.close });
    const event = {
      clientX: 1,
      clientY: 2,
      preventDefault: vi.fn(),
      stopPropagation: vi.fn(),
    } as unknown as MouseEvent;
    await showContextMenu(event, [{ text: "First", action: vi.fn() }]);
    await showContextMenu(event, [{ text: "Second", action: vi.fn() }]);
    expect(firstClose).toHaveBeenCalledOnce();
  });

  it("does not release a newer menu from an older action callback", async () => {
    vi.useFakeTimers();
    try {
      const event = {
        clientX: 1,
        clientY: 2,
        preventDefault: vi.fn(),
        stopPropagation: vi.fn(),
      } as unknown as MouseEvent;
      await showContextMenu(event, [{ text: "First", action: vi.fn() }]);
      const firstAction = mocks.newMenu.mock.calls[mocks.newMenu.mock.calls.length - 1]?.[0].items[0].action;
      firstAction("first");
      await showContextMenu(event, [{ text: "Second", action: vi.fn() }]);
      await vi.runAllTimersAsync();
      expect(mocks.newMenu).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it("provides native text-editing commands and detects editable targets", () => {
    const input = document.createElement("input");
    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    const editable = document.createElement("div");
    editable.setAttribute("contenteditable", "true");
    document.body.append(input, checkbox, editable);

    expect(isEditableContextTarget(input)).toBe(true);
    expect(isEditableContextTarget(checkbox)).toBe(false);
    expect(isEditableContextTarget(editable)).toBe(true);
    expect(isEditableContextTarget(document.createElement("div"))).toBe(false);
    expect(isEditableContextTarget(null)).toBe(false);
    expect(textEditingMenu({ undo: "u", redo: "r", cut: "x", copy: "c", paste: "v", selectAll: "a" }))
      .toEqual(expect.arrayContaining([expect.objectContaining({ kind: "predefined", item: "Copy" })]));
  });

  it("converts predefined and non-action native items", async () => {
    const event = {
      clientX: 2,
      clientY: 3,
      preventDefault: vi.fn(),
      stopPropagation: vi.fn(),
    } as unknown as MouseEvent;
    await showContextMenu(event, [
      ...textEditingMenu({ undo: "u", redo: "r", cut: "x", copy: "c", paste: "v", selectAll: "a" }),
      { text: "Unavailable", enabled: false },
    ]);
    const items = mocks.newMenu.mock.calls[mocks.newMenu.mock.calls.length - 1]?.[0].items;
    expect(items).toEqual(expect.arrayContaining([
      { item: "Copy", text: "c" },
      expect.objectContaining({ text: "Unavailable", enabled: false, action: undefined }),
    ]));
  });

  it("logs native menu failures", async () => {
    mocks.newMenu.mockRejectedValueOnce(new Error("denied"));
    const event = {
      clientX: 0,
      clientY: 0,
      preventDefault: vi.fn(),
      stopPropagation: vi.fn(),
    } as unknown as MouseEvent;
    await showContextMenu(event, [{ text: "Run", action: vi.fn() }]);
    expect(mocks.error).toHaveBeenCalledWith("Failed to open context menu: Error: denied");
  });
});
