import { type ReactNode, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
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
import FeaturesSection from "../settings/FeaturesSection";
import IdleDetectionSection from "../settings/IdleDetectionSection";
import ShortcutsSection from "../settings/ShortcutsSection";
import TestSection from "../settings/TestSection";
import AboutSection from "../settings/AboutSection";

const NAV_ICONS: Record<SettingsSection, ReactNode> = {
  connection: (
    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M13.19 8.688a4.5 4.5 0 011.242 7.244l-4.5 4.5a4.5 4.5 0 01-6.364-6.364l1.757-1.757m9.86-2.06a4.5 4.5 0 00-1.242-7.244l-4.5-4.5a4.5 4.5 0 00-6.364 6.364L4.34 8.798" />
    </svg>
  ),
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
  features: (
    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M6 13.5V3.75m0 9.75a1.5 1.5 0 010 3m0-3a1.5 1.5 0 000 3m0 3.75V16.5m12-3V3.75m0 9.75a1.5 1.5 0 010 3m0-3a1.5 1.5 0 000 3m0 3.75V16.5m-6-9V3.75m0 3.75a1.5 1.5 0 010 3m0-3a1.5 1.5 0 000 3m0 9.75V10.5" />
    </svg>
  ),
  integrations: (
    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M14.25 6.087c0-.355.186-.676.401-.959.221-.29.349-.634.349-1.003 0-1.036-1.007-1.875-2.25-1.875s-2.25.84-2.25 1.875c0 .369.128.713.349 1.003.215.283.401.604.401.959v0a.64.64 0 01-.657.643 48.39 48.39 0 01-4.163-.3c.186 1.613.293 3.25.315 4.907a.656.656 0 01-.658.663v0c-.355 0-.676-.186-.959-.401a1.647 1.647 0 00-1.003-.349c-1.036 0-1.875 1.007-1.875 2.25s.84 2.25 1.875 2.25c.369 0 .713-.128 1.003-.349.283-.215.604-.401.959-.401v0c.31 0 .555.26.532.57a48.039 48.039 0 01-.642 5.056c1.518.19 3.058.309 4.616.354a.64.64 0 00.657-.643v0c0-.355-.186-.676-.401-.959a1.647 1.647 0 01-.349-1.003c0-1.035 1.008-1.875 2.25-1.875 1.243 0 2.25.84 2.25 1.875 0 .369-.128.713-.349 1.003-.215.283-.4.604-.4.959v0c0 .333.277.599.61.58a48.1 48.1 0 005.427-.63 48.05 48.05 0 00.582-4.717.532.532 0 00-.533-.57v0c-.355 0-.676.186-.959.401-.29.221-.634.349-1.003.349-1.035 0-1.875-1.007-1.875-2.25s.84-2.25 1.875-2.25c.37 0 .713.128 1.003.349.283.215.604.401.96.401v0a.656.656 0 00.658-.663 48.422 48.422 0 00-.37-5.36c-1.886.342-3.81.574-5.766.689a.578.578 0 01-.61-.58v0z" />
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
      <path strokeLinecap="round" strokeLinejoin="round" d="M21 8.25c0-2.485-2.099-4.5-4.688-4.5-1.935 0-3.597 1.126-4.312 2.733-.715-1.607-2.377-2.733-4.313-2.733C5.1 3.75 3 5.765 3 8.25c0 7.22 9 12 9 12s9-4.78 9-12z" />
    </svg>
  ),
};

const NAV_LABEL_KEYS: Record<SettingsSection, string> = {
  connection: "connection.title",
  general: "general.title",
  appearance: "appearanceSettings.title",
  tray: "traySettings.title",
  features: "featuresSettings.title",
  integrations: "integrations.title",
  idle: "idle.title",
  shortcuts: "shortcuts.title",
  test: "testSection.title",
  about: "aboutSection.title",
};

const NAV_ORDER: SettingsSection[] = [
  "general",
  "appearance",
  "tray",
  "features",
  "idle",
  "shortcuts",
  "test",
  "about",
];

export default function Settings() {
  const { t } = useTranslation();
  const [section, setSection] = useState<SettingsSection>("connection");
  const [appVersion, setAppVersion] = useState("");
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
      if (target === "connection" || NAV_ORDER.includes(target)) {
        setSection(target);
      }
    });
    return () => { unlisten.then((fn) => fn()); };
  }, []);
  const {
    settings,
    token,
    update,
    loaded,
    saveConnection,
    removeConnection,
  } = useSettings();
  useAppearance();
  useLanguageSync();

  const fallbackConnectionId =
    settings.activeConnectionId || settings.connections[0]?.id || null;
  const connectionSelection =
    selectedConnectionId === undefined
      ? fallbackConnectionId
      : selectedConnectionId &&
          !settings.connections.some((c) => c.id === selectedConnectionId)
        ? fallbackConnectionId
        : selectedConnectionId;

  const openConnection = (id: string | null) => {
    setSelectedConnectionId(id);
    setSection("connection");
  };

  if (!loaded) {
    return (
      <div className="flex h-screen items-center justify-center bg-white dark:bg-[#1a1a1a]">
        <span className="text-[12px] text-gray-400">{t("common.loading")}</span>
      </div>
    );
  }

  return (
    <div className="flex h-screen w-screen bg-white dark:bg-[#1a1a1a] text-gray-900 dark:text-gray-100">
      {/* Sidebar */}
      <nav className="flex w-[200px] shrink-0 flex-col border-r border-gray-100 bg-gray-50/80 dark:border-gray-800 dark:bg-[#141414] pt-4 pb-3">
        <div className="px-4 mb-2">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500">
            {t("connection.connectionsTitle")}
          </span>
        </div>

        <div className="mb-4 space-y-0.5 px-2">
          {settings.connections.map((conn) => {
            const selected = section === "connection" && connectionSelection === conn.id;
            const active = conn.id === settings.activeConnectionId;
            return (
              <button
                key={conn.id}
                type="button"
                onClick={() => openConnection(conn.id)}
                className={`flex w-full min-w-0 items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-[12px] transition-colors
                  focus:outline-none focus-visible:ring-1 focus-visible:ring-blue-400
                  ${
                    selected
                      ? "bg-[var(--accent-light)] text-[var(--accent)] font-medium"
                      : "text-gray-600 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-800"
                  }`}
              >
                <span
                  className={`h-2 w-2 shrink-0 rounded-full ${
                    active ? "bg-emerald-500" : "bg-gray-300 dark:bg-gray-600"
                  }`}
                />
                <span className="min-w-0 flex-1">
                  <span className="block truncate">{conn.name}</span>
                  <span className="block truncate text-[10px] font-normal text-gray-400 dark:text-gray-500">
                    {conn.url}
                  </span>
                </span>
              </button>
            );
          })}

          <button
            type="button"
            onClick={() => openConnection(null)}
            className={`flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-[12px] transition-colors
              focus:outline-none focus-visible:ring-1 focus-visible:ring-blue-400
              ${
                section === "connection" && connectionSelection === null
                  ? "bg-[var(--accent-light)] text-[var(--accent)] font-medium"
                  : "text-[var(--accent)] hover:bg-gray-100 dark:hover:bg-gray-800"
              }`}
          >
            <svg
              className="h-3.5 w-3.5 shrink-0"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M12 4.5v15m7.5-7.5h-15"
              />
            </svg>
            {t("connection.addNew")}
          </button>
        </div>

        <div className="px-4 mb-4">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500">
            {t("settings.title")}
          </span>
        </div>

        <div className="flex-1 space-y-0.5 px-2">
          {NAV_ORDER.map((id) => (
            <button
              key={id}
              type="button"
              onClick={() => setSection(id)}
              className={`flex w-full items-center gap-2.5 rounded-md px-2.5 py-1.5 text-[13px] transition-colors
                focus:outline-none focus-visible:ring-1 focus-visible:ring-blue-400
                ${
                  section === id
                    ? "bg-[var(--accent-light)] text-[var(--accent)] font-medium"
                    : "text-gray-600 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-800"
                }`}
            >
              <span
                className={
                  section === id
                    ? "text-[var(--accent)]"
                    : "text-gray-400 dark:text-gray-500"
                }
              >
                {NAV_ICONS[id]}
              </span>
              {t(NAV_LABEL_KEYS[id])}
            </button>
          ))}
        </div>

        <div className="px-4 text-[10px] text-gray-300 dark:text-gray-600">
          {appVersion && `v${appVersion}`}
        </div>
      </nav>

      {/* Content */}
      <main className="flex-1 overflow-y-auto px-8 py-6">
        <div className={section === "connection" ? "max-w-2xl" : "max-w-lg"}>
          {section === "connection" && (
              <ConnectionSection
                settings={settings}
                token={token}
                selectedConnectionId={connectionSelection}
                onSelectedConnectionChange={setSelectedConnectionId}
                saveConnection={saveConnection}
                removeConnection={removeConnection}
                update={update}
              />
            )}
          {section === "general" && (
            <GeneralSection settings={settings} update={update} />
          )}
          {section === "appearance" && (
            <AppearanceSection settings={settings} update={update} />
          )}
          {section === "tray" && (
            <TrayWindowSection settings={settings} update={update} />
          )}
          {section === "features" && (
            <FeaturesSection settings={settings} update={update} />
          )}
          {section === "idle" && (
            <IdleDetectionSection settings={settings} update={update} />
          )}
          {section === "shortcuts" && (
            <ShortcutsSection settings={settings} update={update} />
          )}
          {section === "test" && <TestSection settings={settings} />}
          {section === "about" && <AboutSection />}
        </div>
      </main>
    </div>
  );
}
