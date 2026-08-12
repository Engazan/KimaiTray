// @vitest-environment jsdom

import { renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  onSettingsChange: vi.fn(),
  changeLanguage: vi.fn(),
  resolveLanguage: vi.fn((value: string) => value),
  listener: undefined as ((settings: { language?: string }) => void) | undefined,
  cleanup: vi.fn(),
}));

vi.mock("../settings/service", () => ({
  onSettingsChange: mocks.onSettingsChange,
}));
vi.mock("../shared/i18n", () => ({
  default: {
    language: "en",
    changeLanguage: mocks.changeLanguage,
  },
  resolveLanguage: mocks.resolveLanguage,
}));

import { useLanguageSync } from "./useLanguageSync";

describe("cross-window language synchronization", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.listener = undefined;
    mocks.resolveLanguage.mockImplementation((value: string) =>
      value === "system" ? "sk" : value,
    );
    mocks.onSettingsChange.mockImplementation((listener) => {
      mocks.listener = listener;
      return Promise.resolve(mocks.cleanup);
    });
  });

  it("changes to a newly resolved language", () => {
    renderHook(() => useLanguageSync());

    mocks.listener?.({ language: "system" });

    expect(mocks.resolveLanguage).toHaveBeenCalledWith("system");
    expect(mocks.changeLanguage).toHaveBeenCalledWith("sk");
  });

  it("ignores missing and already active languages", () => {
    renderHook(() => useLanguageSync());

    mocks.listener?.({});
    mocks.listener?.({ language: "en" });

    expect(mocks.changeLanguage).not.toHaveBeenCalled();
  });

  it("unsubscribes after unmount even when cleanup resolves asynchronously", async () => {
    const { unmount } = renderHook(() => useLanguageSync());
    unmount();

    await waitFor(() => expect(mocks.cleanup).toHaveBeenCalledOnce());
  });
});
