// @vitest-environment jsdom

import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import TestSection from "./TestSection";
import { defaultSettings } from "./service";

const mocks = vi.hoisted(() => ({ loadFavorites: vi.fn(), moveFavorites: vi.fn(), showChangelog: vi.fn(), extract: vi.fn() }));
vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
vi.mock("../api/favoritesStore", () => ({ loadFavorites: mocks.loadFavorites, moveFavorites: mocks.moveFavorites }));
vi.mock("../api/changelog", () => ({ extractVersionChangelog: mocks.extract }));
vi.mock("../api/changelogWindow", () => ({ showChangelogWindow: mocks.showChangelog }));
vi.mock("../../CHANGELOG.md?raw", () => ({ default: "raw changelog" }));

const connections = [
  { id: "a", name: "Alpha", url: "https://a.test" },
  { id: "b", name: "", url: "https://b.test" },
  { id: "c", name: "Charlie", url: "https://c.test" },
];
beforeEach(() => {
  vi.clearAllMocks();
  mocks.loadFavorites.mockResolvedValue([{ key: "one" }, { key: "two" }]);
  mocks.moveFavorites.mockResolvedValue(2);
  mocks.showChangelog.mockResolvedValue(true);
  mocks.extract.mockReturnValue("version body");
});
afterEach(cleanup);

describe("TestSection", () => {
  it("requires two connections and previews a changelog", async () => {
    const user = userEvent.setup();
    render(<TestSection settings={{ ...defaultSettings, connections: [] }} appVersion="1.2.3" />);
    expect(screen.getByText("testSection.needTwo")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "testSection.showChangelog" }));
    expect(mocks.extract).toHaveBeenCalledWith("raw changelog", "1.2.3");
    expect(mocks.showChangelog).toHaveBeenCalledWith({ version: "1.2.3", body: "version body" });
  });

  it("defaults source/target, reports counts and moves favorites", async () => {
    const user = userEvent.setup();
    render(<TestSection settings={{ ...defaultSettings, connections, activeConnectionId: "b" }} appVersion="2" />);
    await waitFor(() => expect(mocks.loadFavorites).toHaveBeenCalledWith("b", "https://b.test"));
    expect((screen.getAllByRole("combobox")[0] as HTMLSelectElement).value).toBe("b");
    expect((screen.getAllByRole("combobox")[1] as HTMLSelectElement).value).toBe("a");
    await user.click(screen.getByRole("button", { name: "testSection.move" }));
    await waitFor(() => expect(mocks.moveFavorites).toHaveBeenCalledWith("b", "a", "https://b.test", "https://a.test"));
    expect(screen.getByText("testSection.moved")).toBeTruthy();
  });

  it("changes source and target and reports nothing moved", async () => {
    const user = userEvent.setup();
    mocks.moveFavorites.mockResolvedValue(0);
    render(<TestSection settings={{ ...defaultSettings, connections, activeConnectionId: "a" }} appVersion="2" />);
    await waitFor(() => expect(screen.getAllByRole("combobox")[1]).toHaveProperty("value", "b"));
    await user.selectOptions(screen.getAllByRole("combobox")[0], "c");
    await waitFor(() => expect(screen.getAllByRole("combobox")[1]).not.toHaveProperty("value", "c"));
    await user.selectOptions(screen.getAllByRole("combobox")[1], "a");
    await user.click(screen.getByRole("button", { name: "testSection.move" }));
    expect(await screen.findByText("testSection.nothing")).toBeTruthy();
  });

  it("reports migration errors and uses an empty changelog fallback", async () => {
    const user = userEvent.setup();
    mocks.moveFavorites.mockRejectedValue(new Error("store failed"));
    mocks.extract.mockReturnValue(null);
    render(<TestSection settings={{ ...defaultSettings, connections: connections.slice(0, 2) }} appVersion="3" />);
    await waitFor(() => expect(screen.getByRole("button", { name: "testSection.move" })).not.toHaveProperty("disabled", true));
    await user.click(screen.getByRole("button", { name: "testSection.move" }));
    expect(await screen.findByText("testSection.error")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "testSection.showChangelog" }));
    expect(mocks.showChangelog).toHaveBeenCalledWith({ version: "3", body: "" });
  });

  it("clears stale counts when the selected source disappears", async () => {
    const { rerender } = render(<TestSection settings={{ ...defaultSettings, connections: connections.slice(0, 2) }} appVersion="1" />);
    await waitFor(() => expect(mocks.loadFavorites).toHaveBeenCalled());
    rerender(<TestSection settings={{ ...defaultSettings, connections: [] }} appVersion="1" />);
    expect(screen.getByText("testSection.needTwo")).toBeTruthy();
  });
});
