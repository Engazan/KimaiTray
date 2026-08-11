// ==UserScript==
// @name         KimaiTray – GitLab issue button
// @namespace    https://github.com/Engazan/KimaiTray
// @version      1.2.1
// @description  Adds a button to GitLab issue breadcrumbs that opens a prefilled new-timer form in KimaiTray.
// @author       KimaiTray contributors
// @match        *://*/*
// @run-at       document-idle
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_registerMenuCommand
// @grant        window.onurlchange
// ==/UserScript==

(function () {
  "use strict";

  const BUTTON_WRAPPER_ID = "kimaitray-gitlab-button";
  const STYLE_ELEMENT_ID = "kimaitray-gitlab-style";
  const BUTTON_CLASS = "kimaitray-gitlab-btn";
  const BREADCRUMB_SELECTOR =
    ".gl-breadcrumb-item.gl-breadcrumb-item-sm";
  const DRAWER_REFERENCE_SELECTOR =
    '[data-testid="work-item-drawer-ref-link"][href]';
  const DRAWER_ACTIONS_SELECTOR =
    ".gl-flex.gl-grow.gl-items-center.gl-gap-2";
  const SETTING_GITLAB_URL = "gitlabBaseUrl";
  const SETTING_CUSTOM_FIELD = "customPluginField";

  function normalizeBaseUrl(rawValue) {
    const url = new URL(rawValue.trim());
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      throw new Error("GitLab URL must use HTTP or HTTPS.");
    }
    if (url.username || url.password) {
      throw new Error("GitLab URL must not contain credentials.");
    }
    url.search = "";
    url.hash = "";
    url.pathname = url.pathname.replace(/\/+$/, "");
    return `${url.origin}${url.pathname}`;
  }

  function configuredBaseUrl() {
    const stored = GM_getValue(SETTING_GITLAB_URL, "");
    if (!stored) return null;
    try {
      return new URL(stored);
    } catch {
      return null;
    }
  }

  function issueUrlFrom(rawUrl) {
    const base = configuredBaseUrl();
    if (!base) return null;

    const current = new URL(rawUrl, window.location.href);
    if (current.origin !== base.origin) return null;
    const basePath = base.pathname.replace(/\/+$/, "");
    if (
      basePath &&
      current.pathname !== basePath &&
      !current.pathname.startsWith(`${basePath}/`)
    ) {
      return null;
    }

    const relativePath = current.pathname.slice(basePath.length);
    if (!/-\/(?:issues|work_items)\/\d+(?:\/|$)/.test(relativePath)) {
      return null;
    }

    current.search = "";
    current.hash = "";
    return current.toString();
  }

  function findButtonPlacement() {
    const drawerLinks = [
      ...document.querySelectorAll(DRAWER_REFERENCE_SELECTOR),
    ];
    for (const drawerLink of drawerLinks.reverse()) {
      const issueUrl = issueUrlFrom(drawerLink.href);
      const container = drawerLink.closest(DRAWER_ACTIONS_SELECTOR);
      if (issueUrl && container) {
        return { issueUrl, container, reference: null, location: "drawer" };
      }
    }

    const issueUrl = issueUrlFrom(window.location.href);
    if (!issueUrl) return null;

    const breadcrumbs = [...document.querySelectorAll(BREADCRUMB_SELECTOR)];
    const reference = breadcrumbs.at(-1);
    if (!reference?.parentNode) return null;
    return {
      issueUrl,
      container: reference.parentNode,
      reference,
      location: "breadcrumb",
    };
  }

  function buildDeepLink(issueUrl) {
    const params = new URLSearchParams({ issue: issueUrl });
    const customField = GM_getValue(SETTING_CUSTOM_FIELD, "").trim();
    if (customField) params.set(`custom.${customField}`, issueUrl);
    return `kimaitray://new?${params.toString()}`;
  }

  function openKimaiTray(issueUrl) {
    // A temporary anchor preserves the browser's normal external-protocol
    // confirmation and keeps the activation tied to the user's click.
    const link = document.createElement("a");
    link.href = buildDeepLink(issueUrl);
    link.hidden = true;
    document.body.append(link);
    link.click();
    link.remove();
  }

  function removeButton() {
    document.getElementById(BUTTON_WRAPPER_ID)?.remove();
  }

  function ensureStyles() {
    if (document.getElementById(STYLE_ELEMENT_ID)) return;
    const style = document.createElement("style");
    style.id = STYLE_ELEMENT_ID;
    // Self-contained styling so the button stays prominent regardless of the
    // GitLab theme (light/dark) instead of blending in as a default button.
    style.textContent = `
      .${BUTTON_CLASS} {
        display: inline-flex;
        align-items: center;
        gap: 0.375rem;
        padding: 0.25rem 0.75rem;
        font-size: 0.8125rem;
        font-weight: 600;
        line-height: 1.25rem;
        color: #fff;
        background-color: #ea580c;
        border: 1px solid #c2410c;
        border-radius: 0.25rem;
        box-shadow: 0 1px 2px rgba(0, 0, 0, 0.2);
        cursor: pointer;
        white-space: nowrap;
      }
      .${BUTTON_CLASS}::before {
        content: "⏱";
        font-size: 0.9375rem;
        line-height: 1;
      }
      .${BUTTON_CLASS}:hover {
        background-color: #c2410c;
        border-color: #9a3412;
      }
      .${BUTTON_CLASS}:active {
        background-color: #9a3412;
      }
      .${BUTTON_CLASS}:focus-visible {
        outline: 2px solid #fdba74;
        outline-offset: 1px;
      }
    `;
    (document.head ?? document.documentElement).append(style);
  }

  function ensureButton() {
    const placement = findButtonPlacement();
    if (!placement) {
      removeButton();
      return;
    }
    const { issueUrl, container, reference, location } = placement;
    const existing = document.getElementById(BUTTON_WRAPPER_ID);
    if (
      existing?.dataset.issueUrl === issueUrl &&
      existing.parentNode === container
    ) {
      return;
    }
    existing?.remove();

    const wrapper = document.createElement(
      reference?.tagName.toLowerCase() === "li" ? "li" : "span",
    );
    wrapper.id = BUTTON_WRAPPER_ID;
    wrapper.dataset.issueUrl = issueUrl;
    if (location === "breadcrumb") {
      wrapper.className = "gl-breadcrumb-item gl-breadcrumb-item-sm";
    }
    wrapper.style.display = "inline-flex";
    wrapper.style.alignItems = "center";
    if (location === "breadcrumb") {
      wrapper.style.marginInlineStart = "0.5rem";
    }

    ensureStyles();

    const button = document.createElement("button");
    button.type = "button";
    button.className = BUTTON_CLASS;
    button.textContent = "Nový Kimai timer";
    button.title = "Otvoriť nový timer v KimaiTray (timer sa automaticky nespustí)";
    button.addEventListener("click", () => openKimaiTray(issueUrl));

    wrapper.append(button);
    if (reference) {
      container.insertBefore(wrapper, reference.nextSibling);
    } else {
      container.append(wrapper);
    }
  }

  let scheduled = false;
  function scheduleButtonRefresh() {
    if (scheduled) return;
    scheduled = true;
    window.requestAnimationFrame(() => {
      scheduled = false;
      ensureButton();
    });
  }

  GM_registerMenuCommand("KimaiTray: nastaviť GitLab integráciu", () => {
    const currentBase = GM_getValue(SETTING_GITLAB_URL, "");
    const rawBase = window.prompt(
      "GitLab base URL (napr. https://gitlab.example.com alebo https://example.com/gitlab):",
      currentBase,
    );
    if (rawBase === null) return;

    let normalizedBase;
    try {
      normalizedBase = normalizeBaseUrl(rawBase);
    } catch (error) {
      window.alert(error instanceof Error ? error.message : String(error));
      return;
    }

    const customField = window.prompt(
      "Custom plugin metadata name (nepovinné; pre Creative Issue Link použi issue_link):",
      GM_getValue(SETTING_CUSTOM_FIELD, ""),
    );
    if (customField === null) return;

    GM_setValue(SETTING_GITLAB_URL, normalizedBase);
    GM_setValue(SETTING_CUSTOM_FIELD, customField.trim());
    window.alert("KimaiTray GitLab userscript bol nastavený.");
    scheduleButtonRefresh();
  });

  GM_registerMenuCommand("KimaiTray: vymazať nastavenia", () => {
    GM_setValue(SETTING_GITLAB_URL, "");
    GM_setValue(SETTING_CUSTOM_FIELD, "");
    removeButton();
  });

  const observer = new MutationObserver(scheduleButtonRefresh);
  observer.observe(document.documentElement, { childList: true, subtree: true });
  if (window.onurlchange === null) {
    window.addEventListener("urlchange", scheduleButtonRefresh);
  }
  window.addEventListener("popstate", scheduleButtonRefresh);
  scheduleButtonRefresh();
})();
