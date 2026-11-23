import { type ReactNode, useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import "@fontsource-variable/geist";
import "@fontsource-variable/geist-mono";
import { getVersion } from "@tauri-apps/api/app";
import { getCurrentWindow } from "@tauri-apps/api/window";
import type { SettingsSection } from "../types";
import { useSettings } from "../settings/useSettings";
import { useAppearance } from "../hooks/useAppearance";
import { useLanguageSync } from "../hooks/useLanguageSync";
import ConnectionSection from "../settings/ConnectionSection";
import GeneralSection from "../settings/GeneralSection";
import AppearanceSection from "../settings/AppearanceSection";
import TrayWindowSection from "../settings/TrayWindowSection";
import IdleDetectionSection from "../settings/IdleDetectionSection";
import TimerReminderSection from "../settings/TimerReminderSection";
import ShortcutsSection from "../settings/ShortcutsSection";
import TestSection from "../settings/TestSection";
import AboutSection from "../settings/AboutSection";
import FeaturesSection from "../settings/FeaturesSection";
import PluginsSection from "../settings/PluginsSection";
import IntegrationsSection from "../settings/IntegrationsSection";
import { SettingsSavedContext } from "../settings/SettingsLayout";
import { currentPlatform } from "../platform";
import type { AppSettings } from "../types";

/** Sidebar-navigable settings sections (excludes connection tabs). */
type NavSection = Exclude<SettingsSection, "connection" | "features" | "integrations">;

const NAV_ICONS: Record<NavSection, ReactNode> = {
  general: (
    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 6h9.75M10.5 6a1.5 1.5 0 11-3 0m3 0a1.5 1.5 0 10-3 0M3.75 6H7.5m3 12h9.75m-9.75 0a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m-3.75 0H7.5m9-6h3.75m-3.75 0a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m-9.75 0h9.75" />
    </svg>
  ),
  appearance: (
    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9.53 16.122a3 3 0 00-5.78 1.128 2.25 2.25 0 01-2.4 2.245 4.5 4.5 0 008.4-2.245c0-.399-.078-.78-.22-1.128zm0 0a15.998 15.998 0 003.388-1.62m-5.043-.025a15.994 15.994 0 011.622-3.395m3.42 3.42a15.995 15.995 0 004.764-4.648l3.876-5.814a1.151 1.151 0 00-1.597-1.597L14.146 6.32a15.996 15.996 0 00-4.649 4.763m3.42 3.42a6.776 6.776 0 00-3.42-3.42" />
    </svg>
  ),
  tray: (
    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 17.25v1.007a3 3 0 01-.879 2.122L7.5 21h9l-.621-.621A3 3 0 0115 18.257V17.25m6-12V15a2.25 2.25 0 01-2.25 2.25H5.25A2.25 2.25 0 013 15V5.25A2.25 2.25 0 015.25 3h13.5A2.25 2.25 0 0121 5.25z" />
    </svg>
  ),
  reminder: (
    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M14.857 17.082a23.848 23.848 0 005.454-1.31A8.967 8.967 0 0118 9.75V9A6 6 0 006 9v.75a8.967 8.967 0 01-2.312 6.022c1.733.64 3.56 1.081 5.455 1.31m5.714 0a24.255 24.255 0 01-5.714 0m5.714 0a3 3 0 11-5.714 0" />
    </svg>
  ),
  idle: (
    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M21.752 15.002A9.718 9.718 0 0118 15.75 9.75 9.75 0 018.25 6c0-1.33.266-2.597.748-3.752A9.753 9.753 0 003 11.25 9.75 9.75 0 0012.75 21a9.753 9.753 0 009.002-5.998z" />
    </svg>
  ),
  shortcuts: (
    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 7.5l3 2.25-3 2.25m4.5 0h3m-9 8.25h13.5A2.25 2.25 0 0021 18V6a2.25 2.25 0 00-2.25-2.25H5.25A2.25 2.25 0 003 6v12a2.25 2.25 0 002.25 2.25z" />
    </svg>
  ),
  test: (
    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9.75 3.104v5.714a2.25 2.25 0 01-.659 1.591L5 14.5M9.75 3.104c-.251.023-.501.05-.75.082m.75-.082a24.301 24.301 0 014.5 0m0 0v5.714c0 .597.237 1.17.659 1.591L19.8 15.3M14.25 3.104c.251.023.501.05.75.082M19.8 15.3l-1.57.393A9.065 9.065 0 0112 15a9.065 9.065 0 00-6.23-.693L5 14.5m14.8.8l1.402 1.402c1.232 1.232.65 3.318-1.067 3.611A48.309 48.309 0 0112 21c-2.773 0-5.491-.235-8.135-.687-1.718-.293-2.3-2.379-1.067-3.61L5 14.5" />
    </svg>
  ),
  about: (
    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M11.25 11.25l.041-.02a.75.75 0 011.063.852l-.708 2.836a.75.75 0 001.063.853l.041-.021M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9-3.75h.008v.008H12V8.25z" />
    </svg>
  ),
};

const NAV_LABEL_KEYS: Record<NavSection, string> = {
  general: "general.title",
  appearance: "appearanceSettings.title",
  tray: "traySettings.title",
  reminder: "timerReminder.title",
  idle: "idle.title",
  shortcuts: "shortcuts.title",
  test: "testSection.title",
  about: "aboutSection.title",
};

/** Settings sections grouped into logical categories for the sidebar. */
const NAV_GROUPS: { titleKey: string; items: NavSection[] }[] = [
  { titleKey: "settingsGroups.preferences", items: ["general"] },
  { titleKey: "settingsGroups.interface", items: ["appearance", "tray"] },
  { titleKey: "settingsGroups.automation", items: ["reminder", "idle", "shortcuts"] },
  { titleKey: "settingsGroups.system", items: ["test", "about"] },
];

const NAV_ITEMS: NavSection[] = NAV_GROUPS.flatMap((g) => g.items);

function BrandMark() {
  return (
    <span className="flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-[9px] bg-[var(--accent)] text-white shadow-[0_2px_8px_var(--accent-line)]">
      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.2}>
        <circle cx="12" cy="12" r="8.25" />
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 7.75V12l2.75 1.75" />
      </svg>
    </span>
  );
}

/** Lowercase and strip diacritics so "nečinnosť" matches "necinnost". */
function normalizeSearch(value: string): string {
  return value.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

const NAV_ITEM =
  "flex w-full min-w-0 items-center gap-2.5 rounded-[7px] px-2.5 py-[7px] text-left text-[13px] transition-colors " +
  "focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]";
const NAV_ITEM_ON = "bg-[var(--accent-soft)] font-medium text-[var(--accent)]";
const NAV_ITEM_OFF =
  "text-[var(--s-fg-muted)] hover:bg-[var(--s-hover)] hover:text-[var(--s-fg)]";

export default function Settings() {
  const { t } = useTranslation();
  const [section, setSection] = useState<SettingsSection>("connection");
  const [appVersion, setAppVersion] = useState("");
  const [query, setQuery] = useState("");
  const [savedAt, setSavedAt] = useState(0);
  const [noResults, setNoResults] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);
  const resultsRef = useRef<HTMLDivElement>(null);
  const mainRef = useRef<HTMLElement>(null);
  const [selectedConnectionId, setSelectedConnectionId] = useState<
    string | null | undefined
  >(undefined);

  useEffect(() => {
    getVersion().then(setAppVersion);
  }, []);

  useEffect(() => {
    const win = getCurrentWindow();
    const unlisten = win.listen<string>("kimai://navigate-section", (e) => {
      const target = e.payload as SettingsSection;
      if (target === "connection" || NAV_ITEMS.includes(target as NavSection)) {
        setQuery("");
        setSection(target);
      }
    });
    return () => { unlisten.then((fn) => fn()); };
  }, []);

  // ⌘K / Ctrl+K and "/" focus the settings search.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const typing = !!target && /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName);
      if (((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") || (e.key === "/" && !typing)) {
        e.preventDefault();
        searchRef.current?.focus();
        searchRef.current?.select();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const {
    settings,
    token,
    update: rawUpdate,
    loaded,
    saveConnection,
    removeConnection,
    activateConnection,
  } = useSettings();
  useAppearance();
  useLanguageSync();

  const update = useCallback(
    <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => {
      rawUpdate(key, value);
      setSavedAt(Date.now());
    },
    [rawUpdate],
  );

  // Filter rendered settings rows by the search query. Works on the DOM so
  // every section keeps rendering its own, fully interactive controls.
  const searching = query.trim().length > 0;
  useLayoutEffect(() => {
    const root = resultsRef.current;
    if (!searching || !root) return;
    const q = normalizeSearch(query.trim());
    let anyHit = false;
    root.querySelectorAll<HTMLElement>("[data-search-section]").forEach((sectionEl) => {
      let hits = 0;
      sectionEl.querySelectorAll<HTMLElement>("[data-settings-item]").forEach((item) => {
        const haystack = normalizeSearch(
          `${item.textContent ?? ""} ${item.dataset.settingsSearch ?? ""}`,
        );
        const match = haystack.includes(q);
        item.hidden = !match;
        if (match) hits++;
      });
      sectionEl.querySelectorAll<HTMLElement>("[data-settings-group]").forEach((group) => {
        group.hidden = !group.querySelector("[data-settings-item]:not([hidden])");
      });
      sectionEl.hidden = hits === 0;
      if (hits > 0) anyHit = true;
    });
    setNoResults(!anyHit);
  }, [searching, query, settings, appVersion]);

  const fallbackConnectionId =
    settings.activeConnectionId || settings.connections[0]?.id || null;
  const connectionSelection =
    selectedConnectionId === undefined
      ? fallbackConnectionId
      : selectedConnectionId &&
          !settings.connections.some((c) => c.id === selectedConnectionId)
        ? fallbackConnectionId
        : selectedConnectionId;

  const searchConnection =
    settings.connections.find((c) => c.id === connectionSelection) ?? null;

  const go = (target: SettingsSection) => {
    setQuery("");
    setSection(target);
    mainRef.current?.scrollTo?.({ top: 0 });
  };

  const openConnection = (id: string | null) => {
    setSelectedConnectionId(id);
    go("connection");
  };

  if (!loaded) {
    return (
      <div className="settings-root flex h-screen items-center justify-center bg-[var(--s-window)]">
        <span className="text-[12px] text-[var(--s-fg-subtle)]">{t("common.loading")}</span>
      </div>
    );
  }

  const renderSection = (id: NavSection) => {
    switch (id) {
      case "general":
        return <GeneralSection settings={settings} update={update} />;
      case "appearance":
        return <AppearanceSection settings={settings} update={update} />;
      case "tray":
        return <TrayWindowSection settings={settings} update={update} />;
      case "reminder":
        return <TimerReminderSection settings={settings} update={update} />;
      case "idle":
        return <IdleDetectionSection settings={settings} update={update} />;
      case "shortcuts":
        return <ShortcutsSection settings={settings} update={update} />;
      case "test":
        return <TestSection settings={settings} appVersion={appVersion} />;
      case "about":
        return <AboutSection />;
    }
  };

  return (
    <SettingsSavedContext.Provider value={savedAt}>
      <div className="settings-root flex h-screen w-screen overflow-hidden bg-[var(--s-window)] text-[var(--s-fg)] antialiased">
        {/* Sidebar */}
        <nav className="flex w-[228px] shrink-0 flex-col border-r border-[var(--s-line)] bg-[var(--s-sidebar)]">
          <div className="flex flex-col gap-3 px-3.5 pb-2.5 pt-3.5">
            <div className="flex items-center gap-2.5">
              <BrandMark />
              <div className="min-w-0 leading-tight">
                <div className="truncate text-[13.5px] font-semibold">KimaiTray</div>
                {appVersion && (
                  <div className="font-mono text-[10.5px] text-[var(--s-fg-subtle)]">
                    v{appVersion}
                  </div>
                )}
              </div>
            </div>
            <div className="relative">
              <svg className="pointer-events-none absolute left-[9px] top-[9px] h-3.5 w-3.5 text-[var(--s-fg-subtle)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <circle cx="11" cy="11" r="7" />
                <path strokeLinecap="round" d="M20 20l-3.5-3.5" />
              </svg>
              <input
                ref={searchRef}
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Escape") setQuery(""); }}
                placeholder={t("settings.searchPlaceholder")}
                aria-label={t("settings.searchPlaceholder")}
                autoComplete="off"
                className="h-8 w-full rounded-lg border border-[var(--s-line)] bg-[var(--s-card)] pl-[30px] pr-11 text-[12.5px] outline-none
                  placeholder:text-[var(--s-fg-subtle)] focus:border-[var(--accent)] focus:shadow-[0_0_0_3px_var(--accent-soft)]
                  [&::-webkit-search-cancel-button]:hidden"
              />
              <kbd className="pointer-events-none absolute right-[7px] top-[7px] rounded border border-[var(--s-line)] bg-[var(--s-sidebar)] px-[5px] py-px font-mono text-[10px] text-[var(--s-fg-subtle)]">
                {currentPlatform().os === "macos" ? "⌘K" : "Ctrl K"}
              </kbd>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto px-2 pb-3.5 [scrollbar-width:thin]">
            {/* Connections group */}
            <NavGroupHeader>{t("connection.connectionsTitle")}</NavGroupHeader>
            <div className="space-y-px">
              {settings.connections.map((conn) => {
                const selected =
                  !searching && section === "connection" && connectionSelection === conn.id;
                const active = conn.id === settings.activeConnectionId;
                return (
                  <button
                    key={conn.id}
                    type="button"
                    onClick={() => openConnection(conn.id)}
                    className={`${NAV_ITEM} ${selected ? NAV_ITEM_ON : NAV_ITEM_OFF}`}
                  >
                    <span
                      title={active ? t("connection.activeSuffix") : undefined}
                      className={`h-2 w-2 shrink-0 rounded-full ${
                        active
                          ? "bg-emerald-500 shadow-[0_0_0_3px_rgba(16,185,129,0.2)]"
                          : "bg-gray-400/50 dark:bg-gray-500/50"
                      }`}
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate">{conn.name}</span>
                      <span className="block truncate text-[10.5px] font-normal text-[var(--s-fg-subtle)]">
                        {conn.url}
                      </span>
                    </span>
                  </button>
                );
              })}

              <button
                type="button"
                onClick={() => openConnection(null)}
                className={`${NAV_ITEM} ${
                  !searching && section === "connection" && connectionSelection === null
                    ? NAV_ITEM_ON
                    : "text-[var(--accent)] hover:bg-[var(--s-hover)]"
                }`}
              >
                <svg className="h-3.5 w-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                </svg>
                {t("connection.addNew")}
              </button>
            </div>

            {/* Settings groups */}
            {NAV_GROUPS.map((group) => (
              <div key={group.titleKey}>
                <NavGroupHeader>{t(group.titleKey)}</NavGroupHeader>
                <div className="space-y-px">
                  {group.items.map((id) => {
                    const on = !searching && section === id;
                    return (
                      <button
                        key={id}
                        type="button"
                        onClick={() => go(id)}
                        className={`${NAV_ITEM} ${on ? NAV_ITEM_ON : NAV_ITEM_OFF}`}
                      >
                        <span className={on ? "text-[var(--accent)]" : "opacity-80"}>
                          {NAV_ICONS[id]}
                        </span>
                        {t(NAV_LABEL_KEYS[id])}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </nav>

        {/* Content */}
        <main ref={mainRef} className="min-w-0 flex-1 overflow-y-auto [scrollbar-width:thin]">
          <div className="mx-auto w-full max-w-[720px] px-7 pb-12 pt-[26px]">
            {searching ? (
              <div ref={resultsRef} className="space-y-[22px]">
                <header>
                  <h2 className="text-[21px] font-semibold tracking-[-0.015em]">
                    {t("settings.searchResults", { query: query.trim() })}
                  </h2>
                  <p className="mt-1.5 text-[12.5px] text-[var(--s-fg-muted)]">
                    {t("settings.searchHint")}
                  </p>
                </header>
                {searchConnection && (
                  <div
                    data-search-section
                    className="space-y-3 [&_[data-settings-note]]:hidden [&_[data-settings-page-header]]:hidden"
                  >
                    <SearchSectionLink onClick={() => openConnection(searchConnection.id)}>
                      {searchConnection.name}
                    </SearchSectionLink>
                    <FeaturesSection settings={settings} update={update} connectionId={searchConnection.id} />
                    <PluginsSection settings={settings} update={update} connectionId={searchConnection.id} />
                    <IntegrationsSection settings={settings} update={update} connectionId={searchConnection.id} />
                  </div>
                )}
                {NAV_ITEMS.map((id) => (
                  <div
                    key={id}
                    data-search-section
                    className="space-y-3 [&_[data-settings-note]]:hidden [&_[data-settings-page-header]]:hidden"
                  >
                    <SearchSectionLink onClick={() => go(id)}>
                      {t(NAV_LABEL_KEYS[id])}
                    </SearchSectionLink>
                    {renderSection(id)}
                  </div>
                ))}
                {noResults && (
                  <p className="py-10 text-center text-[13px] text-[var(--s-fg-subtle)]">
                    {t("settings.searchEmpty", { query: query.trim() })}
                  </p>
                )}
              </div>
            ) : section === "connection" ? (
              <ConnectionSection
                settings={settings}
                token={token}
                selectedConnectionId={connectionSelection}
                onSelectedConnectionChange={setSelectedConnectionId}
                saveConnection={saveConnection}
                removeConnection={removeConnection}
                activateConnection={activateConnection}
                update={update}
              />
            ) : (
              NAV_ITEMS.includes(section as NavSection) && renderSection(section as NavSection)
            )}
          </div>
        </main>
      </div>
    </SettingsSavedContext.Provider>
  );
}

function NavGroupHeader({ children }: { children: ReactNode }) {
  return (
    <div className="px-2.5 pb-[5px] pt-3.5">
      <span className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--s-fg-subtle)]">
        {children}
      </span>
    </div>
  );
}

function SearchSectionLink({ onClick, children }: { onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex items-center gap-1.5 text-[12px] font-semibold text-[var(--s-fg-muted)] hover:text-[var(--accent)] focus:outline-none focus-visible:text-[var(--accent)]"
    >
      {children}
      <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 6l6 6-6 6" />
      </svg>
    </button>
  );
}
