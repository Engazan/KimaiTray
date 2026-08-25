// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render } from "@testing-library/react";

const mocks = vi.hoisted(() => ({ show: vi.fn() }));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));
vi.mock("./contextMenu", async (importOriginal) => {
  const original = await importOriginal<typeof import("./contextMenu")>();
  return { ...original, showContextMenu: mocks.show };
});

import GlobalContextMenuGuard from "./GlobalContextMenuGuard";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("GlobalContextMenuGuard", () => {
  it("replaces the WebView menu on editable fields", () => {
    const { container } = render(<><GlobalContextMenuGuard /><input /></>);
    const input = container.querySelector("input")!;
    fireEvent.contextMenu(input, { clientX: 4, clientY: 8 });
    expect(mocks.show).toHaveBeenCalledOnce();
    expect(mocks.show.mock.calls[0][1]).toEqual(
      expect.arrayContaining([expect.objectContaining({ kind: "predefined", item: "Copy" })]),
    );
  });

  it("suppresses the generic menu without inventing actions for plain content", () => {
    const { getByText } = render(<><GlobalContextMenuGuard /><div>plain</div></>);
    const event = new MouseEvent("contextmenu", { bubbles: true, cancelable: true });
    getByText("plain").dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
    expect(mocks.show).not.toHaveBeenCalled();
  });
});
