// @vitest-environment jsdom

import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { I18nextProvider } from "react-i18next";
import i18n, { initPromise } from "../shared/i18n";
import { defaultSettings } from "./service";
import ConnectionSection from "./ConnectionSection";

const apiMocks = vi.hoisted(() => ({
  getConnectionToken: vi.fn(),
}));

vi.mock("../api", () => ({
  isInsecureUrl: () => false,
  testConnection: vi.fn(),
}));
vi.mock("../api/connectionTokenStore", () => ({
  getConnectionToken: apiMocks.getConnectionToken,
}));

beforeAll(async () => {
  await initPromise;
  await i18n.changeLanguage("en");
});

beforeEach(() => {
  apiMocks.getConnectionToken.mockResolvedValue("secret-token");
});

describe("connection internal ID", () => {
  it("reveals and copies the selected saved connection ID", async () => {
    const connection = {
      id: "connection-a-internal-id",
      name: "Creative Sites",
      url: "https://kimai.example.test",
    };
    const user = userEvent.setup();
    const writeText = vi
      .spyOn(navigator.clipboard, "writeText")
      .mockResolvedValue(undefined);

    render(
      <I18nextProvider i18n={i18n}>
        <ConnectionSection
          settings={{
            ...defaultSettings,
            kimaiUrl: connection.url,
            connections: [connection],
            activeConnectionId: connection.id,
          }}
          token="secret-token"
          selectedConnectionId={connection.id}
          onSelectedConnectionChange={vi.fn()}
          saveConnection={vi.fn()}
          removeConnection={vi.fn()}
          update={vi.fn()}
        />
      </I18nextProvider>,
    );

    expect(screen.queryByText(connection.id)).toBeNull();
    await user.click(
      screen.getByRole("button", { name: "Show internal ID" }),
    );
    expect(screen.getByText(connection.id)).toBeTruthy();

    await user.click(screen.getByRole("button", { name: "Copy ID" }));
    expect(writeText).toHaveBeenCalledWith(connection.id);
    expect(
      screen.getByRole("button", { name: "Copied!" }),
    ).toBeTruthy();
  });
});
