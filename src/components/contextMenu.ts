import type { MouseEvent as ReactMouseEvent } from "react";
import { LogicalPosition } from "@tauri-apps/api/dpi";
import { Menu } from "@tauri-apps/api/menu";
import type {
  MenuItemOptions,
  PredefinedMenuItemOptions,
  SubmenuOptions,
} from "@tauri-apps/api/menu";
import { logger } from "../utils/logger";

export type ContextMenuEntry =
  | (MenuItemOptions & { kind?: "item" })
  | ({ kind: "separator" } & Partial<PredefinedMenuItemOptions>)
  | ({ kind: "predefined" } & PredefinedMenuItemOptions)
  | ({ kind: "submenu"; text: string; enabled?: boolean; items: ContextMenuEntry[] });

type ContextMenuEvent = MouseEvent | ReactMouseEvent<HTMLElement>;

let sequence = 0;
let activeMenu: Menu | null = null;

function scheduleActiveMenuRelease(): void {
  const selectedMenu = activeMenu;
  window.setTimeout(() => {
    if (!selectedMenu || activeMenu !== selectedMenu) return;
    activeMenu = null;
    void selectedMenu.close().catch(() => undefined);
  }, 0);
}

function nativeEntry(entry: ContextMenuEntry): MenuItemOptions | PredefinedMenuItemOptions | SubmenuOptions {
  if (entry.kind === "separator") return { item: "Separator" };
  if (entry.kind === "predefined") return { item: entry.item, text: entry.text };
  if (entry.kind === "submenu") {
    return {
      id: `context-submenu-${++sequence}`,
      text: entry.text,
      enabled: entry.enabled,
      items: entry.items.map(nativeEntry),
    };
  }
  return {
    id: entry.id ?? `context-action-${++sequence}`,
    text: entry.text,
    enabled: entry.enabled,
    accelerator: entry.accelerator,
    action: entry.action
      ? (id) => {
          entry.action?.(id);
          scheduleActiveMenuRelease();
        }
      : undefined,
  };
}

/** Opens a native Tauri context menu at the exact webview pointer position. */
export async function showContextMenu(
  event: ContextMenuEvent,
  entries: ContextMenuEntry[],
): Promise<void> {
  event.preventDefault();
  event.stopPropagation();
  if (entries.length === 0) return;

  try {
    if (activeMenu) {
      const previousMenu = activeMenu;
      activeMenu = null;
      await previousMenu.close().catch(() => undefined);
    }
    const menu = await Menu.new({ items: entries.map(nativeEntry) });
    activeMenu = menu;
    await menu.popup(new LogicalPosition(event.clientX, event.clientY));
  } catch (error) {
    logger.error(`Failed to open context menu: ${String(error)}`);
  }
}

export function separator(): ContextMenuEntry {
  return { kind: "separator" };
}

export function isEditableContextTarget(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false;
  const editable = target.closest("input, textarea, [contenteditable='true']");
  if (!editable) return false;
  return !(editable instanceof HTMLInputElement && ["button", "checkbox", "color", "file", "radio", "range", "reset", "submit"].includes(editable.type));
}

export function textEditingMenu(
  labels: { undo: string; redo: string; cut: string; copy: string; paste: string; selectAll: string },
): ContextMenuEntry[] {
  return [
    { kind: "predefined", item: "Undo", text: labels.undo },
    { kind: "predefined", item: "Redo", text: labels.redo },
    separator(),
    { kind: "predefined", item: "Cut", text: labels.cut },
    { kind: "predefined", item: "Copy", text: labels.copy },
    { kind: "predefined", item: "Paste", text: labels.paste },
    separator(),
    { kind: "predefined", item: "SelectAll", text: labels.selectAll },
  ];
}
