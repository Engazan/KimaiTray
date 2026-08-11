import { readFileSync } from "node:fs";
import { JSDOM } from "jsdom";
import { describe, expect, it, vi } from "vitest";

const userscript = readFileSync(
  new URL("./gitlab.user.js", import.meta.url),
  "utf8",
);

type MenuCommand = () => void;

function runUserscript(
  html: string,
  url: string,
  initialSettings: Record<string, unknown> = {},
) {
  const dom = new JSDOM(html, {
    url,
    pretendToBeVisual: true,
    runScripts: "dangerously",
  });
  const settings: Record<string, unknown> = {
    gitlabBaseUrl: "https://gitlab.example.test",
    customPluginField: "",
    ...initialSettings,
  };
  const menuCommands = new Map<string, MenuCommand>();
  Object.assign(dom.window, {
    GM_getValue: (key: string, fallback: unknown) => settings[key] ?? fallback,
    GM_setValue: (key: string, value: unknown) => {
      settings[key] = value;
    },
    GM_registerMenuCommand: vi.fn((name: string, command: MenuCommand) => {
      menuCommands.set(name, command);
    }),
  });
  dom.window.eval(userscript);
  return { dom, menuCommands, settings };
}

async function flushAnimationFrames(dom: JSDOM) {
  await new Promise<void>((resolve) => {
    dom.window.requestAnimationFrame(() => {
      dom.window.requestAnimationFrame(() => resolve());
    });
  });
}

describe("GitLab Tampermonkey userscript", () => {
  it("appends the timer button to an open board work-item drawer", async () => {
    const { dom } = runUserscript(
      `<div class="gl-flex gl-grow gl-items-center gl-gap-2" id="drawer-actions">
        <a
          href="https://gitlab.example.test/group/project/-/work_items/725"
          data-testid="work-item-drawer-ref-link"
        >project#725</a>
        <button data-testid="work-item-drawer-copy-button">Copy</button>
      </div>`,
      "https://gitlab.example.test/group/project/-/boards/1",
    );

    await vi.waitFor(() => {
      expect(
        dom.window.document.getElementById("kimaitray-gitlab-button"),
      ).not.toBeNull();
    });

    const actions = dom.window.document.getElementById("drawer-actions");
    expect(actions?.lastElementChild).toMatchObject({
      id: "kimaitray-gitlab-button",
    });
    expect(actions?.lastElementChild?.getAttribute("data-issue-url")).toBe(
      "https://gitlab.example.test/group/project/-/work_items/725",
    );
    expect(actions?.lastElementChild?.textContent).toBe("Nový Kimai timer");
    await flushAnimationFrames(dom);
  });

  it("keeps adding the timer button after issue breadcrumbs", async () => {
    const { dom } = runUserscript(
      `<ol id="breadcrumbs">
        <li class="gl-breadcrumb-item gl-breadcrumb-item-sm">Issue 725</li>
      </ol>`,
      "https://gitlab.example.test/group/project/-/work_items/725",
    );

    await vi.waitFor(() => {
      expect(
        dom.window.document.getElementById("kimaitray-gitlab-button"),
      ).not.toBeNull();
    });

    expect(
      dom.window.document.getElementById("breadcrumbs")?.lastElementChild,
    ).toMatchObject({ id: "kimaitray-gitlab-button" });
    await flushAnimationFrames(dom);
  });

  it("shows the timer button on every configured GitLab server", async () => {
    const { dom } = runUserscript(
      `<ol id="breadcrumbs">
        <li class="gl-breadcrumb-item gl-breadcrumb-item-sm">Issue 42</li>
      </ol>`,
      "https://gitlab.second.test/group/project/-/issues/42",
      {
        gitlabBaseUrls: [
          "https://gitlab.first.test",
          "https://gitlab.second.test",
        ],
      },
    );

    await vi.waitFor(() => {
      expect(
        dom.window.document.getElementById("kimaitray-gitlab-button"),
      ).not.toBeNull();
    });
    await flushAnimationFrames(dom);
  });

  it("migrates the legacy GitLab URL into the server list", async () => {
    const { dom, settings } = runUserscript(
      `<ol>
        <li class="gl-breadcrumb-item gl-breadcrumb-item-sm">Issue 725</li>
      </ol>`,
      "https://gitlab.example.test/group/project/-/issues/725",
    );

    await vi.waitFor(() => {
      expect(settings.gitlabBaseUrls).toEqual([
        "https://gitlab.example.test",
      ]);
    });
    await flushAnimationFrames(dom);
  });

  it("adds, lists and removes GitLab servers through menu commands", () => {
    const { dom, menuCommands, settings } = runUserscript(
      "<main></main>",
      "https://gitlab.first.test/dashboard",
      { gitlabBaseUrls: ["https://gitlab.first.test"] },
    );
    const prompt = vi.spyOn(dom.window, "prompt");
    const alert = vi.spyOn(dom.window, "alert").mockImplementation(() => {});

    prompt.mockReturnValueOnce("https://gitlab.second.test/");
    menuCommands.get("KimaiTray: pridať GitLab server")?.();
    expect(settings.gitlabBaseUrls).toEqual([
      "https://gitlab.first.test",
      "https://gitlab.second.test",
    ]);

    menuCommands.get("KimaiTray: zobraziť GitLab servery")?.();
    expect(alert).toHaveBeenLastCalledWith(
      "Nakonfigurované GitLab servery:\n\n" +
        "https://gitlab.first.test\nhttps://gitlab.second.test",
    );

    prompt.mockReturnValueOnce("1");
    menuCommands.get("KimaiTray: odstrániť GitLab server")?.();
    expect(settings.gitlabBaseUrls).toEqual(["https://gitlab.second.test"]);
  });
});
