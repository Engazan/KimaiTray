import { readFileSync } from "node:fs";
import { JSDOM } from "jsdom";
import { describe, expect, it, vi } from "vitest";

const userscript = readFileSync(
  new URL("./gitlab.user.js", import.meta.url),
  "utf8",
);

function runUserscript(html: string, url: string) {
  const dom = new JSDOM(html, {
    url,
    pretendToBeVisual: true,
    runScripts: "dangerously",
  });
  const settings: Record<string, string> = {
    gitlabBaseUrl: "https://gitlab.example.test",
    kimaiConnectionId: "",
    customPluginField: "",
  };
  Object.assign(dom.window, {
    GM_getValue: (key: string, fallback: string) => settings[key] ?? fallback,
    GM_setValue: (key: string, value: string) => {
      settings[key] = value;
    },
    GM_registerMenuCommand: vi.fn(),
  });
  dom.window.eval(userscript);
  return dom;
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
    const dom = runUserscript(
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
    const dom = runUserscript(
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
});
