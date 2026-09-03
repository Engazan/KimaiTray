// @vitest-environment jsdom

import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { I18nextProvider } from "react-i18next";
import i18n, { initPromise } from "../shared/i18n";
import { defaultSettings } from "./service";
import ConnectionSection from "./ConnectionSection";

const apiMocks = vi.hoisted(() => ({
  getConnectionToken: vi.fn(),
  testConnection: vi.fn(),
  isInsecureUrl: vi.fn(),
}));

vi.mock("../api", () => ({
  isInsecureUrl: apiMocks.isInsecureUrl,
  testConnection: apiMocks.testConnection,
}));
vi.mock("../api/connectionTokenStore", () => ({
  getConnectionToken: apiMocks.getConnectionToken,
}));
vi.mock("./FeaturesSection", () => ({ default: ({ connectionId }: { connectionId: string }) => <div>features:{connectionId}</div> }));
vi.mock("./IntegrationsSection", () => ({ default: ({ connectionId }: { connectionId: string }) => <div>integrations:{connectionId}</div> }));
vi.mock("./PluginsSection", () => ({ default: ({ connectionId }: { connectionId: string }) => <div>plugins:{connectionId}</div> }));

beforeAll(async () => {
  await initPromise;
  await i18n.changeLanguage("en");
});

beforeEach(() => {
  vi.clearAllMocks();
  apiMocks.getConnectionToken.mockResolvedValue("secret-token");
  apiMocks.isInsecureUrl.mockReturnValue(false);
  apiMocks.testConnection.mockResolvedValue({ success: true, user: { alias: "Tester", username: "tester" }, version: { version: "2.0" } });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
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

  it("loads a saved connection, toggles its token and navigates connection tabs", async () => {
    const user = userEvent.setup();
    const connection = { id: "conn", name: "Kimai", url: "https://kimai.test" };
    render(
      <I18nextProvider i18n={i18n}>
        <ConnectionSection
          settings={{ ...defaultSettings, connections: [connection], activeConnectionId: "conn" }}
          token="fallback"
          selectedConnectionId="conn"
          onSelectedConnectionChange={vi.fn()}
          saveConnection={vi.fn()}
          removeConnection={vi.fn()}
          update={vi.fn()}
        />
      </I18nextProvider>,
    );
    await screen.findByDisplayValue("secret-token");
    expect(document.querySelector('input[type="password"]')).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Show" }));
    expect(document.querySelector('input[type="text"][value="secret-token"]')).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Features" }));
    expect(screen.getByText("features:conn")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Integrations" }));
    expect(screen.getByText("integrations:conn")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Plugins" }));
    expect(screen.getByText("plugins:conn")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Connection" }));
    expect(screen.getByText("Kimai")).toBeTruthy();
  });

  it("creates a named connection after a successful test", async () => {
    const user = userEvent.setup();
    const saveConnection = vi.fn().mockResolvedValue(undefined);
    const selected = vi.fn();
    vi.spyOn(crypto, "randomUUID").mockReturnValue(
      "00000000-0000-4000-8000-000000000001",
    );
    render(
      <I18nextProvider i18n={i18n}>
        <ConnectionSection
          settings={defaultSettings}
          token=""
          selectedConnectionId={null}
          onSelectedConnectionChange={selected}
          saveConnection={saveConnection}
          removeConnection={vi.fn()}
          update={vi.fn()}
        />
      </I18nextProvider>,
    );
    const inputs = document.querySelectorAll("input");
    await user.type(inputs[0], "My Kimai");
    await user.type(inputs[1], "https://kimai.test");
    await user.type(inputs[2], "token");
    await user.click(screen.getByRole("button", { name: "Test & Save" }));
    await waitFor(() => expect(saveConnection).toHaveBeenCalledWith({ id: "00000000-0000-4000-8000-000000000001", name: "My Kimai", url: "https://kimai.test" }, "token"));
    expect(selected).toHaveBeenCalledWith("00000000-0000-4000-8000-000000000001");
    expect(screen.getByText(/Connected as Tester/)).toBeTruthy();
  });

  it("adds discovered fields without replacing manual connection fields", async () => {
    const user = userEvent.setup();
    const connection = { id: "conn", name: "Kimai", url: "https://kimai.test" };
    const manualField = {
      name: "notes",
      label: "My notes",
      type: "text" as const,
      required: false,
    };
    const detectedField = {
      name: "ticket_url",
      label: "Ticket URL",
      type: "url" as const,
      required: true,
    };
    apiMocks.testConnection.mockResolvedValue({
      success: true,
      user: { alias: "Tester", username: "tester" },
      customFields: [
        { ...manualField, label: "Server notes", required: true },
        detectedField,
      ],
    });
    const update = vi.fn();
    render(
      <I18nextProvider i18n={i18n}>
        <ConnectionSection
          settings={{
            ...defaultSettings,
            connections: [connection],
            activeConnectionId: connection.id,
            timesheetCustomFields: { [connection.id]: [manualField] },
          }}
          token="secret-token"
          selectedConnectionId={connection.id}
          onSelectedConnectionChange={vi.fn()}
          saveConnection={vi.fn().mockResolvedValue(undefined)}
          removeConnection={vi.fn()}
          update={update}
        />
      </I18nextProvider>,
    );

    await screen.findByDisplayValue("secret-token");
    await user.click(screen.getByRole("button", { name: "Test & Save" }));
    await waitFor(() =>
      expect(update).toHaveBeenCalledWith("timesheetCustomFields", {
        conn: [manualField, detectedField],
      }),
    );
  });

  it("derives a hostname name and warns about insecure URLs", async () => {
    const user = userEvent.setup();
    apiMocks.isInsecureUrl.mockReturnValue(true);
    apiMocks.testConnection.mockResolvedValue({ success: true, user: { alias: "", username: "user" } });
    const saveConnection = vi.fn().mockResolvedValue(undefined);
    render(
      <I18nextProvider i18n={i18n}>
        <ConnectionSection settings={defaultSettings} token="" selectedConnectionId={null} onSelectedConnectionChange={vi.fn()} saveConnection={saveConnection} removeConnection={vi.fn()} update={vi.fn()} />
      </I18nextProvider>,
    );
    const inputs = document.querySelectorAll("input");
    await user.type(inputs[1], "http://kimai.test");
    await user.type(inputs[2], "token");
    expect(screen.getByText(/HTTPS/)).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Test & Save" }));
    await waitFor(() => expect(saveConnection).toHaveBeenCalledWith(expect.objectContaining({ name: "kimai.test" }), "token"));
  });

  it.each([
    ["failed result", { success: false, error: "Bad token" }, "Bad token"],
    ["failed result without detail", { success: false }, "Connection failed"],
  ])("reports a %s", async (_label, result, message) => {
    const user = userEvent.setup();
    apiMocks.testConnection.mockResolvedValue(result);
    render(
      <I18nextProvider i18n={i18n}>
        <ConnectionSection settings={defaultSettings} token="" selectedConnectionId={null} onSelectedConnectionChange={vi.fn()} saveConnection={vi.fn()} removeConnection={vi.fn()} update={vi.fn()} />
      </I18nextProvider>,
    );
    const inputs = document.querySelectorAll("input");
    await user.type(inputs[1], "https://kimai.test");
    await user.type(inputs[2], "token");
    await user.click(screen.getByRole("button", { name: "Test & Save" }));
    expect(await screen.findByText(message)).toBeTruthy();
  });

  it("reports thrown test and save failures", async () => {
    const user = userEvent.setup();
    apiMocks.testConnection.mockRejectedValueOnce(new Error("network"));
    const { unmount } = render(
      <I18nextProvider i18n={i18n}>
        <ConnectionSection settings={defaultSettings} token="" selectedConnectionId={null} onSelectedConnectionChange={vi.fn()} saveConnection={vi.fn()} removeConnection={vi.fn()} update={vi.fn()} />
      </I18nextProvider>,
    );
    let inputs = document.querySelectorAll("input");
    await user.type(inputs[1], "https://kimai.test");
    await user.type(inputs[2], "token");
    await user.click(screen.getByRole("button", { name: "Test & Save" }));
    expect(await screen.findByText(/Unexpected error/)).toBeTruthy();
    unmount();

    apiMocks.testConnection.mockResolvedValue({ success: true, user: { username: "user" } });
    render(
      <I18nextProvider i18n={i18n}>
        <ConnectionSection settings={defaultSettings} token="" selectedConnectionId={null} onSelectedConnectionChange={vi.fn()} saveConnection={vi.fn().mockRejectedValue(new Error("store"))} removeConnection={vi.fn()} update={vi.fn()} />
      </I18nextProvider>,
    );
    inputs = document.querySelectorAll("input");
    await user.type(inputs[1], "https://kimai.test");
    await user.type(inputs[2], "token");
    await user.click(screen.getByRole("button", { name: "Test & Save" }));
    expect(await screen.findByText(/Unexpected error/)).toBeTruthy();
  });

  it("deletes connections, selects the next one and reports credential cleanup", async () => {
    const user = userEvent.setup();
    const connections = [
      { id: "a", name: "A", url: "https://a.test" },
      { id: "b", name: "B", url: "https://b.test" },
    ];
    const selected = vi.fn();
    const removeConnection = vi.fn().mockResolvedValue({ credentialCleanupPending: true });
    render(
      <I18nextProvider i18n={i18n}>
        <ConnectionSection settings={{ ...defaultSettings, connections, activeConnectionId: "a" }} token="" selectedConnectionId="a" onSelectedConnectionChange={selected} saveConnection={vi.fn()} removeConnection={removeConnection} update={vi.fn()} />
      </I18nextProvider>,
    );
    await screen.findByDisplayValue("secret-token");
    await user.click(screen.getByRole("button", { name: "Delete" }));
    await waitFor(() => expect(selected).toHaveBeenCalledWith("b"));
    expect(await screen.findByText(/Unexpected error/)).toBeTruthy();
  });

  it("reports deletion and clipboard failures and can hide the internal ID", async () => {
    const user = userEvent.setup();
    const connection = { id: "conn", name: "Kimai", url: "https://kimai.test" };
    const writeText = vi.spyOn(navigator.clipboard, "writeText").mockRejectedValue(new Error("denied"));
    render(
      <I18nextProvider i18n={i18n}>
        <ConnectionSection settings={{ ...defaultSettings, connections: [connection] }} token="" selectedConnectionId="conn" onSelectedConnectionChange={vi.fn()} saveConnection={vi.fn()} removeConnection={vi.fn().mockRejectedValue(new Error("store"))} update={vi.fn()} />
      </I18nextProvider>,
    );
    await screen.findByDisplayValue("secret-token");
    await user.click(screen.getByRole("button", { name: "Show internal ID" }));
    await user.click(screen.getByRole("button", { name: "Copy ID" }));
    expect(writeText).toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Copy ID" })).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Hide" }));
    expect(screen.queryByText("conn")).toBeNull();
    await user.click(screen.getByRole("button", { name: "Delete" }));
    expect(await screen.findByText(/Unexpected error/)).toBeTruthy();
  });

  it("falls back to the active token when secure token loading fails", async () => {
    apiMocks.getConnectionToken.mockRejectedValue(new Error("keychain"));
    const connection = { id: "conn", name: "Kimai", url: "https://kimai.test" };
    render(
      <I18nextProvider i18n={i18n}>
        <ConnectionSection settings={{ ...defaultSettings, connections: [connection], activeConnectionId: "conn" }} token="active-token" selectedConnectionId="conn" onSelectedConnectionChange={vi.fn()} saveConnection={vi.fn()} removeConnection={vi.fn()} update={vi.fn()} />
      </I18nextProvider>,
    );
    expect(await screen.findByDisplayValue("active-token")).toBeTruthy();
  });

  it.each(["resolve", "reject"])("ignores a stale token %s after selecting another connection", async (outcome) => {
    let settle!: () => void;
    apiMocks.getConnectionToken
      .mockImplementationOnce(() => new Promise((resolve, reject) => {
        settle = () => outcome === "resolve" ? resolve("stale") : reject(new Error("stale"));
      }))
      .mockResolvedValueOnce("token-b");
    const connections = [
      { id: "a", name: "A", url: "https://a.test" },
      { id: "b", name: "B", url: "https://b.test" },
    ];
    const common = { settings: { ...defaultSettings, connections }, token: "", onSelectedConnectionChange: vi.fn(), saveConnection: vi.fn(), removeConnection: vi.fn(), update: vi.fn() };
    const { rerender } = render(<I18nextProvider i18n={i18n}><ConnectionSection {...common} selectedConnectionId="a" /></I18nextProvider>);
    await waitFor(() => expect(apiMocks.getConnectionToken).toHaveBeenCalledTimes(1));
    rerender(<I18nextProvider i18n={i18n}><ConnectionSection {...common} selectedConnectionId="b" /></I18nextProvider>);
    expect(await screen.findByDisplayValue("token-b")).toBeTruthy();
    await settle();
    expect(screen.getByDisplayValue("token-b")).toBeTruthy();
  });

  it("loads a legacy URL and derives an invalid URL as its fallback name", async () => {
    const user = userEvent.setup();
    const saveConnection = vi.fn().mockResolvedValue(undefined);
    const { unmount } = render(<I18nextProvider i18n={i18n}><ConnectionSection
      settings={{ ...defaultSettings, kimaiUrl: "https://legacy.test", connections: [] }} token="" selectedConnectionId={null}
      onSelectedConnectionChange={vi.fn()} saveConnection={saveConnection} removeConnection={vi.fn()} update={vi.fn()}
    /></I18nextProvider>);
    expect(await screen.findByDisplayValue("https://legacy.test")).toBeTruthy();
    unmount();

    render(<I18nextProvider i18n={i18n}><ConnectionSection settings={defaultSettings} token="" selectedConnectionId={null}
      onSelectedConnectionChange={vi.fn()} saveConnection={saveConnection} removeConnection={vi.fn()} update={vi.fn()}
    /></I18nextProvider>);
    const inputs = document.querySelectorAll("input");
    await user.type(inputs[1], "invalid-url");
    await user.type(inputs[2], "token");
    await user.click(screen.getByRole("button", { name: "Test & Save" }));
    await waitFor(() => expect(saveConnection).toHaveBeenCalledWith(expect.objectContaining({ name: "invalid-url" }), "token"));
  });

  it("does not copy an internal ID when the Clipboard API is unavailable", async () => {
    const user = userEvent.setup();
    const connection = { id: "conn", name: "Kimai", url: "https://kimai.test" };
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: undefined });
    render(<I18nextProvider i18n={i18n}><ConnectionSection
      settings={{ ...defaultSettings, connections: [connection] }} token="" selectedConnectionId="conn"
      onSelectedConnectionChange={vi.fn()} saveConnection={vi.fn()} removeConnection={vi.fn()} update={vi.fn()}
    /></I18nextProvider>);
    await screen.findByDisplayValue("secret-token");
    await user.click(screen.getByRole("button", { name: "Show internal ID" }));
    await user.click(screen.getByRole("button", { name: "Copy ID" }));
    expect(screen.getByRole("button", { name: "Copy ID" })).toBeTruthy();
  });
});
