import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { enable, disable, isEnabled } from "@tauri-apps/plugin-autostart";
import type { AppSettings } from "../types";
import { checkForUpdate, installUpdate } from "../api/updater";
import i18n from "../shared/i18n";
import { resolveLanguage, type LanguageSetting } from "../shared/i18n";
import { Select, Toggle, buttonClass } from "./Controls";
import {
  SettingsList,
  SettingsPage,
  SettingsRow,
} from "./SettingsLayout";

interface Props {
  settings: AppSettings;
  update: <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => void;
}

const LANGUAGE_OPTIONS: { value: string; label: string }[] = [
  { value: "sk", label: "Slovensky" },
  { value: "en", label: "English" },
  { value: "cs", label: "Česky" },
  { value: "de", label: "Deutsch" },
  { value: "uk", label: "Українська" },
  { value: "es", label: "Español" },
  { value: "system", label: "" },
];

export default function GeneralSection({ settings, update }: Props) {
  const { t } = useTranslation();
  const [autostart, setAutostart] = useState(settings.launchAtLogin);
  const [checking, setChecking] = useState(false);
  const [updateResult, setUpdateResult] = useState<"upToDate" | "available" | "error" | null>(null);
  const [updateVersion, setUpdateVersion] = useState<string | null>(null);

  useEffect(() => {
    isEnabled().then(setAutostart).catch(() => {});
  }, []);

  const toggleAutostart = useCallback(async (v: boolean) => {
    try {
      if (v) {
        await enable();
      } else {
        await disable();
      }
      setAutostart(v);
      update("launchAtLogin", v);
    } catch {
      // Autostart not available
    }
  }, [update]);

  const handleLanguageChange = useCallback(
    (value: string) => {
      const lang = value as LanguageSetting;
      update("language", lang);
      i18n.changeLanguage(resolveLanguage(lang));
    },
    [update],
  );

  const checkForUpdates = useCallback(async () => {
    setChecking(true);
    setUpdateResult(null);
    try {
      const upd = await checkForUpdate();
      if (upd) {
        setUpdateResult("available");
        setUpdateVersion(upd.version);
        await installUpdate(upd);
      } else {
        setUpdateResult("upToDate");
      }
    } catch {
      setUpdateResult("error");
    } finally {
      setChecking(false);
    }
  }, []);

  const languageOptions = LANGUAGE_OPTIONS.map((opt) =>
    opt.value === "system"
      ? { ...opt, label: t("settings.systemLanguage") }
      : opt,
  );

  return (
    <SettingsPage title={t("general.title")} description={t("general.description")}>
      <SettingsList title={t("settingsGroups.preferences")}>
        <SettingsRow label={t("settings.language")} description={t("settings.languageDescription")}>
          <Select
            value={settings.language}
            onChange={handleLanguageChange}
            options={languageOptions}
          />
        </SettingsRow>

        <SettingsRow label={t("general.launchAtLogin")} description={t("general.launchAtLoginDescription")}>
          <Toggle ariaLabel={t("general.launchAtLogin")} checked={autostart} onChange={toggleAutostart} />
        </SettingsRow>

        <SettingsRow label={t("general.refreshInterval")} description={t("general.refreshIntervalDescription")}>
          <Select
            value={settings.refreshInterval}
            onChange={(v) => update("refreshInterval", Number(v))}
            options={[
              { value: 15, label: t("general.seconds_15") },
              { value: 30, label: t("general.seconds_30") },
              { value: 60, label: t("general.minute_1") },
              { value: 120, label: t("general.minutes_2") },
              { value: 300, label: t("general.minutes_5") },
              { value: 600, label: t("general.minutes_10") },
            ]}
          />
        </SettingsRow>

        <SettingsRow label={t("general.openKimaiInBrowser")} description={t("general.openKimaiInBrowserDescription")}>
          <Toggle
            checked={settings.openKimaiInBrowser}
            onChange={(v) => update("openKimaiInBrowser", v)}
          />
        </SettingsRow>
      </SettingsList>

      <SettingsList title={t("updateSettings.title")}>
        <SettingsRow
          label={t("updateSettings.autoUpdate")}
          description={t("updateSettings.autoUpdateDescription")}
        >
          <Toggle
            checked={settings.autoUpdate}
            onChange={(v) => update("autoUpdate", v)}
          />
        </SettingsRow>

        <SettingsRow
          label={t("updateSettings.checkForUpdates")}
          description={
            updateResult === "upToDate" ? (
              <span className="text-emerald-600 dark:text-emerald-400">{t("updateSettings.upToDate")}</span>
            ) : updateResult === "available" ? (
              <span className="text-[var(--accent)]">{t("updateSettings.updateAvailable", { version: updateVersion })}</span>
            ) : updateResult === "error" ? (
              <span className="text-red-500 dark:text-red-400">{t("updateSettings.checkFailed")}</span>
            ) : undefined
          }
        >
          <button
            type="button"
            disabled={checking}
            onClick={checkForUpdates}
            className={buttonClass()}
          >
            {checking && (
              <span className="h-3 w-3 animate-spin rounded-full border-2 border-current border-r-transparent" aria-hidden="true" />
            )}
            {checking ? t("updateSettings.checking") : t("updateSettings.checkForUpdates")}
          </button>
        </SettingsRow>
      </SettingsList>
    </SettingsPage>
  );
}
