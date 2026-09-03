// @vitest-environment jsdom

import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { I18nextProvider } from "react-i18next";
import i18n, { initPromise } from "../shared/i18n";
import ActiveTimerCard, { formatElapsed } from "./ActiveTimerCard";
import { getEnabledPluginCustomInputs } from "../plugins/customInputs";

const nativeMocks = vi.hoisted(() => ({
  tick: null as null | (() => void),
  unlisten: vi.fn(),
  openUrl: vi.fn(),
}));

vi.mock("@tauri-apps/api/window", () => ({
  getCurrentWindow: () => ({
    listen: vi.fn(async (_event: string, callback: () => void) => {
      nativeMocks.tick = callback;
      return nativeMocks.unlisten;
    }),
  }),
}));
vi.mock("@tauri-apps/plugin-opener", () => ({ openUrl: nativeMocks.openUrl }));
vi.mock("./TagsInput", () => ({
  default: ({ onChange, onCommit }: { onChange: (tags: string[]) => void; onCommit: () => void }) => (
    <div data-testid="tags-input">
      <button onClick={() => onChange(["Changed", "Two"])}>change-tags</button>
      <button onClick={onCommit}>commit-tags</button>
    </div>
  ),
}));
vi.mock("./DateTimePicker", () => ({
  default: ({ onChange, onClose }: { onChange: (value: string) => void; onClose: () => void }) => (
    <div data-testid="date-picker">
      <button onClick={() => onChange("invalid")}>date-invalid</button>
      <button onClick={() => onChange("2999-01-01T00:00")}>date-future</button>
      <button onClick={() => onChange("2020-01-01T10:30")}>date-valid</button>
      <button onClick={() => onChange("2021-01-01T10:00")}>date-same</button>
      <button onClick={onClose}>date-close</button>
    </div>
  ),
}));

beforeAll(async () => {
  await initPromise;
  await i18n.changeLanguage("en");
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  nativeMocks.tick = null;
});

const baseTimer = {
  id: 10,
  projectId: 2,
  activityId: 3,
  project: "Alpha",
  projectColor: "#000000",
  activityColor: "#111111",
  customerColor: "#222222",
  activity: "Work",
  description: "Old note",
  tags: ["One"],
  beginSeconds: Math.floor(Date.now() / 1000) - 65,
  beginIso: "2021-01-01T10:00:00",
};

describe("ActiveTimerCard keyboard actions", () => {
  it("formats elapsed values with and without seconds", () => {
    expect(formatElapsed(3_661)).toBe("01:01:01");
    expect(formatElapsed(3_661, false)).toBe("01:01");
  });

  it("opens a configured URL custom field", async () => {
    const user = userEvent.setup();
    const onEdit = vi.fn();
    render(
      <I18nextProvider i18n={i18n}>
        <ActiveTimerCard
          timer={{ ...baseTimer, metadata: { url_link: "https://example.test/34" } }}
          onStop={vi.fn()}
          onEdit={onEdit}
          pluginCustomInputs={getEnabledPluginCustomInputs(
            { creativeIssueLink: false },
            [{ name: "url_link", label: "URL link", type: "url", required: false }],
          )}
        />
      </I18nextProvider>,
    );

    await user.click(screen.getByRole("button", { name: "Open URL link" }));
    expect(nativeMocks.openUrl).toHaveBeenCalledWith("https://example.test/34");
    await user.click(screen.getByText("https://example.test/34"));
    const input = screen.getByLabelText("URL link");
    await user.clear(input);
    await user.type(input, "ftp://invalid.test{Enter}");
    expect(onEdit).not.toHaveBeenCalled();
  });

  it("opens and saves the note editor from a shortcut request in compact mode", async () => {
    const user = userEvent.setup();
    const onEdit = vi.fn();
    const onHandled = vi.fn();
    render(
      <I18nextProvider i18n={i18n}>
        <ActiveTimerCard
          timer={{
            id: 1,
            projectId: 2,
            activityId: 3,
            project: "Alpha",
            projectColor: "#000000",
            activityColor: "#000000",
            customerColor: "#000000",
            activity: "Work",
            description: "Old note",
            tags: [],
            beginSeconds: Math.floor(Date.now() / 1000),
            beginIso: new Date().toISOString(),
          }}
          onStop={vi.fn()}
          onEdit={onEdit}
          compact
          editDescriptionRequest={1}
          onEditDescriptionRequestHandled={onHandled}
        />
      </I18nextProvider>,
    );

    const input = await screen.findByRole("textbox");
    expect(document.activeElement).toBe(input);
    await user.clear(input);
    await user.type(input, "New note{Enter}");

    expect(onEdit).toHaveBeenCalledWith(1, { description: "New note" });
    expect(onHandled).toHaveBeenCalledOnce();
  });

  it("adds the current session to time already spent on the linked issue", () => {
    const nowSeconds = Math.floor(Date.now() / 1000);

    render(
      <I18nextProvider i18n={i18n}>
        <ActiveTimerCard
          timer={{
            id: 2,
            projectId: 2,
            activityId: 3,
            project: "Alpha",
            projectColor: "#000000",
            activityColor: "#000000",
            customerColor: "#000000",
            activity: "Work",
            description: "",
            tags: [],
            beginSeconds: nowSeconds - 300,
            beginIso: new Date((nowSeconds - 300) * 1000).toISOString(),
          }}
          onStop={vi.fn()}
          timeEstimate={7_200}
          timeSpent={3_600}
        />
      </I18nextProvider>,
    );

    expect(screen.getByText("1h5m / 2h")).toBeTruthy();
  });

  it("shows and edits an active timer plugin custom field", async () => {
    const user = userEvent.setup();
    const onEdit = vi.fn();
    render(
      <I18nextProvider i18n={i18n}>
        <ActiveTimerCard
          timer={{
            id: 3,
            projectId: 2,
            activityId: 3,
            project: "Alpha",
            projectColor: "#000000",
            activityColor: "#000000",
            customerColor: "#000000",
            activity: "Work",
            description: "",
            tags: [],
            metadata: { issue_link: "CREATIVE-123" },
            beginSeconds: Math.floor(Date.now() / 1000),
            beginIso: new Date().toISOString(),
          }}
          onStop={vi.fn()}
          onEdit={onEdit}
          pluginCustomInputs={getEnabledPluginCustomInputs({
            creativeIssueLink: true,
          })}
        />
      </I18nextProvider>,
    );

    await user.click(screen.getByText("CREATIVE-123"));
    const input = screen.getByLabelText("Issue / Ticket");
    expect(document.activeElement).toBe(input);
    await user.clear(input);
    await user.type(input, "CREATIVE-456{Enter}");

    expect(onEdit).toHaveBeenCalledWith(3, {
      metadata: { issue_link: "CREATIVE-456" },
    });
    expect(onEdit).toHaveBeenCalledTimes(1);

    await user.click(screen.getByText("CREATIVE-123"));
    const unchanged = screen.getByLabelText("Issue / Ticket");
    await user.clear(unchanged);
    await user.type(unchanged, "CREATIVE-123{Enter}");
    expect(onEdit).toHaveBeenCalledTimes(1);
  });

  it("runs compact pause/stop controls, ticking and loading states", async () => {
    const user = userEvent.setup();
    const onPause = vi.fn();
    const onStop = vi.fn();
    const { rerender, unmount } = render(
      <I18nextProvider i18n={i18n}>
        <ActiveTimerCard timer={baseTimer} onStop={onStop} onPause={onPause} compact />
      </I18nextProvider>,
    );
    await user.click(screen.getByRole("button", { name: "Pause" }));
    await user.click(screen.getByRole("button", { name: "Stop" }));
    expect(onPause).toHaveBeenCalledOnce();
    expect(onStop).toHaveBeenCalledOnce();
    nativeMocks.tick?.();

    rerender(
      <I18nextProvider i18n={i18n}>
        <ActiveTimerCard timer={baseTimer} onStop={onStop} onPause={onPause} compact isPausing />
      </I18nextProvider>,
    );
    expect(screen.getByRole("button", { name: "Pause" }).hasAttribute("disabled")).toBe(true);
    rerender(
      <I18nextProvider i18n={i18n}>
        <ActiveTimerCard timer={baseTimer} onStop={onStop} onPause={onPause} compact isStopping />
      </I18nextProvider>,
    );
    expect(screen.getByRole("button", { name: "Stop" }).hasAttribute("disabled")).toBe(true);
    unmount();
    await Promise.resolve();
    expect(nativeMocks.unlisten).toHaveBeenCalled();
  });

  it("edits, cancels and blurs the description without redundant saves", async () => {
    const user = userEvent.setup();
    const onEdit = vi.fn();
    const onHandled = vi.fn();
    render(
      <I18nextProvider i18n={i18n}>
        <ActiveTimerCard timer={baseTimer} onStop={vi.fn()} onEdit={onEdit} onEditDescriptionRequestHandled={onHandled} />
      </I18nextProvider>,
    );
    await user.click(screen.getByRole("button", { name: "Old note" }));
    await user.keyboard("{Escape}");
    expect(onHandled).toHaveBeenCalledOnce();
    await user.click(screen.getByRole("button", { name: "Old note" }));
    const input = screen.getByRole("textbox");
    fireEvent.blur(input);
    expect(onEdit).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Old note" }));
    await user.clear(screen.getByRole("textbox"));
    await user.type(screen.getByRole("textbox"), "Blurred note");
    fireEvent.blur(screen.getByRole("textbox"));
    expect(onEdit).toHaveBeenCalledWith(10, { description: "Blurred note" });
  });

  it("edits empty plugin values and supports Escape and blur", async () => {
    const user = userEvent.setup();
    const onEdit = vi.fn();
    const inputs = getEnabledPluginCustomInputs({ creativeIssueLink: true });
    render(
      <I18nextProvider i18n={i18n}>
        <ActiveTimerCard timer={{ ...baseTimer, metadata: {} }} onStop={vi.fn()} onEdit={onEdit} pluginCustomInputs={inputs} />
      </I18nextProvider>,
    );
    await user.click(screen.getByRole("button", { name: /issue/i }));
    await user.keyboard("{Escape}");
    await user.click(screen.getByRole("button", { name: /issue/i }));
    const input = screen.getByLabelText("Issue / Ticket");
    await user.type(input, "ABC-1");
    fireEvent.blur(input);
    expect(onEdit).toHaveBeenCalledWith(10, { metadata: { issue_link: "ABC-1" } });
  });

  it("commits changed tags and leaves equivalent tags untouched", async () => {
    const user = userEvent.setup();
    const onEdit = vi.fn();
    const { rerender } = render(
      <I18nextProvider i18n={i18n}>
        <ActiveTimerCard timer={baseTimer} onStop={vi.fn()} onEdit={onEdit} />
      </I18nextProvider>,
    );
    await user.click(screen.getByRole("button", { name: /One/ }));
    await user.click(screen.getByRole("button", { name: "change-tags" }));
    await user.click(screen.getByRole("button", { name: "commit-tags" }));
    expect(onEdit).toHaveBeenCalledWith(10, { tags: ["Changed", "Two"] });

    rerender(
      <I18nextProvider i18n={i18n}>
        <ActiveTimerCard timer={{ ...baseTimer, id: 11, tags: [] }} onStop={vi.fn()} onEdit={onEdit} />
      </I18nextProvider>,
    );
    await user.click(screen.getByRole("button", { name: /Add tags/ }));
    await user.click(screen.getByRole("button", { name: "commit-tags" }));
    expect(onEdit).toHaveBeenCalledTimes(1);
  });

  it("validates and saves edited begin times", async () => {
    const user = userEvent.setup();
    const onEdit = vi.fn();
    render(
      <I18nextProvider i18n={i18n}>
        <ActiveTimerCard timer={baseTimer} onStop={vi.fn()} onEdit={onEdit} />
      </I18nextProvider>,
    );
    await user.click(screen.getByRole("button", { name: /since/i }));
    await user.click(screen.getByRole("button", { name: "date-invalid" }));
    await user.click(screen.getByRole("button", { name: "date-close" }));
    expect(screen.getByText("Invalid time")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "date-future" }));
    await user.click(screen.getByRole("button", { name: "date-close" }));
    expect(screen.getByText("Can't be in the future")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "date-valid" }));
    await user.click(screen.getByRole("button", { name: "date-close" }));
    expect(onEdit).toHaveBeenCalledWith(10, { begin: "2020-01-01T10:30:00" });

    await user.click(screen.getByRole("button", { name: /since/i }));
    await user.click(screen.getByRole("button", { name: "date-same" }));
    await user.click(screen.getByRole("button", { name: "date-close" }));
    expect(onEdit).toHaveBeenCalledTimes(1);
  });

  it("opens linked issues and renders badges, errors and disabled fields", async () => {
    const user = userEvent.setup();
    render(
      <I18nextProvider i18n={i18n}>
        <ActiveTimerCard
          timer={{ ...baseTimer, description: "", tags: [] }}
          onStop={vi.fn()}
          multipleActive
          isSaving
          saveError="save failed"
          issueUrl="https://git.test/issue/1"
          timeEstimate={60}
          timeSpent={3_600}
          pluginCustomInputs={getEnabledPluginCustomInputs({ creativeIssueLink: true })}
        />
      </I18nextProvider>,
    );
    expect(screen.getByText("+more")).toBeTruthy();
    expect(screen.getByText("Saving…")).toBeTruthy();
    expect(screen.getByRole("alert").textContent).toBe("save failed");
    await user.click(screen.getByRole("button", { name: "Open in browser" }));
    expect(nativeMocks.openUrl).toHaveBeenCalledWith("https://git.test/issue/1");
    expect(screen.getByRole("button", { name: /Add note/ }).hasAttribute("disabled")).toBe(true);
  });

  it("covers full-card focus, loading, disabled editing and tag blur variants", async () => {
    const user = userEvent.setup();
    const onEdit = vi.fn();
    const { rerender } = render(
      <I18nextProvider i18n={i18n}>
        <ActiveTimerCard timer={baseTimer} onStop={vi.fn()} onEdit={onEdit} onPause={vi.fn()} focusMode timeEstimate={600} />
      </I18nextProvider>,
    );
    expect(screen.getByText(/\/ 10m/)).toBeTruthy();
    await user.click(screen.getByRole("button", { name: /One/ }));
    fireEvent.blur(screen.getByTestId("tags-input").parentElement!, { relatedTarget: document.body });

    rerender(<I18nextProvider i18n={i18n}><ActiveTimerCard timer={baseTimer} onStop={vi.fn()} isPausing onPause={vi.fn()} /></I18nextProvider>);
    expect(screen.getByRole("button", { name: "Pause" }).hasAttribute("disabled")).toBe(true);
    rerender(<I18nextProvider i18n={i18n}><ActiveTimerCard timer={baseTimer} onStop={vi.fn()} isStopping onPause={vi.fn()} /></I18nextProvider>);
    expect(screen.getByRole("button", { name: "Stop" }).hasAttribute("disabled")).toBe(true);
    rerender(<I18nextProvider i18n={i18n}><ActiveTimerCard timer={baseTimer} onStop={vi.fn()} editDescriptionRequest={1} /></I18nextProvider>);
    expect(screen.queryByRole("textbox")).toBeNull();
    expect(screen.getByRole("button", { name: /Old note/ }).hasAttribute("disabled")).toBe(true);
  });
});
