import { type ReactNode, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { getVersion } from "@tauri-apps/api/app";
import type { SettingsSection } from "../types";
import { useSettings } from "../settings/useSettings";
import { useAppearance } from "../hooks/useAppearance";
import { useLanguageSync } from "../hooks/useLanguageSync";
import ConnectionSection from "../settings/ConnectionSection";
import GeneralSection from "../settings/GeneralSection";
import FeaturesSection from "../settings/FeaturesSection";
import TimerSection from "../settings/TimerSection";
import IdleDetectionSection from "../settings/IdleDetectionSection";
import AppearanceSection from "../settings/AppearanceSection";
import ShortcutsSection from "../settings/ShortcutsSection";
import UpdateSection from "../settings/UpdateSection";
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
  features: (
    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M6 13.5V3.75m0 9.75a1.5 1.5 0 010 3m0-3a1.5 1.5 0 000 3m0 3.75V16.5m12-3V3.75m0 9.75a1.5 1.5 0 010 3m0-3a1.5 1.5 0 000 3m0 3.75V16.5m-6-9V3.75m0 3.75a1.5 1.5 0 010 3m0-3a1.5 1.5 0 000 3m0 9.75V10.5" />
    </svg>
  ),
  timer: (
    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6l4 2m6-2a10 10 0 11-20 0 10 10 0 0120 0z" />
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
  update: (
    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182M21.015 4.356v4.992" />
    </svg>
  ),
  appearance: (
    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9.53 16.122a3 3 0 00-5.78 1.128 2.25 2.25 0 01-2.4 2.245 4.5 4.5 0 008.4-2.245c0-.399-.078-.78-.22-1.128zm0 0a15.998 15.998 0 003.388-1.62m-5.043-.025a15.994 15.994 0 011.622-3.395m3.42 3.42a15.995 15.995 0 004.764-4.648l3.876-5.814a1.151 1.151 0 00-1.597-1.597L14.146 6.32a15.996 15.996 0 00-4.649 4.763m3.42 3.42a6.776 6.776 0 00-3.42-3.42" />
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
  features: "featuresSettings.title",
  timer: "timerSettings.title",
  idle: "idle.title",
  shortcuts: "shortcuts.title",
  update: "updateSettings.title",
  appearance: "appearanceSettings.title",
  about: "aboutSection.title",
};

const NAV_ORDER: SettingsSection[] = [
  "connection",
  "general",
  "features",
  "timer",
  "idle",
  "shortcuts",
  "update",
  "appearance",
  "about",
];

export default function Settings() {
  const { t } = useTranslation();
  const [section, setSection] = useState<SettingsSection>("connection");
  const [appVersion, setAppVersion] = useState("");

  useEffect(() => {
    getVersion().then(setAppVersion);
  }, []);
  const {
    settings,
    token,
    update,
    loaded,
    saveConnection,
    removeConnection,
    activateConnection,
  } = useSettings();
  useAppearance();
  useLanguageSync();

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
        <div className="max-w-lg">
          {section === "connection" && (
            <ConnectionSection
              settings={settings}
              token={token}
              saveConnection={saveConnection}
              removeConnection={removeConnection}
              activateConnection={activateConnection}
            />
          )}
          {section === "general" && (
            <GeneralSection settings={settings} update={update} />
          )}
          {section === "features" && (
            <FeaturesSection settings={settings} update={update} />
          )}
          {section === "timer" && (
            <TimerSection settings={settings} update={update} />
          )}
          {section === "idle" && (
            <IdleDetectionSection settings={settings} update={update} />
          )}
          {section === "shortcuts" && (
            <ShortcutsSection settings={settings} update={update} />
          )}
          {section === "update" && (
            <UpdateSection settings={settings} update={update} />
          )}
          {section === "appearance" && (
            <AppearanceSection settings={settings} update={update} />
          )}
          {section === "about" && <AboutSection />}
        </div>
      </main>
    </div>
  );
}
