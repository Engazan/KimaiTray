import { useEffect, useState } from "react";
import type { MouseEvent as ReactMouseEvent } from "react";
import { useTranslation } from "react-i18next";
import { getVersion } from "@tauri-apps/api/app";
import { openUrl } from "@tauri-apps/plugin-opener";
import { SettingsCard, SettingsList, SettingsPage } from "./SettingsLayout";
import { separator, showContextMenu } from "../components/contextMenu";

function LinkButton({
  label,
  href,
  icon,
  disabled,
}: {
  label: string;
  href: string;
  icon: React.ReactNode;
  disabled?: boolean;
}) {
  const { t } = useTranslation();
  /* v8 ignore start -- callback executes from a native OS context menu */
  const openLinkContextMenu = (event: ReactMouseEvent<HTMLElement>) => {
    if (disabled) return;
    void showContextMenu(event, [
      { text: t("contextMenu.openLink"), action: () => { void openUrl(href); } },
      separator(),
      { text: t("contextMenu.copyLink"), action: () => { void navigator.clipboard.writeText(href); } },
    ]);
  };
  /* v8 ignore stop */
  return (
    <button
      type="button"
      onClick={() => { if (!disabled) openUrl(href).catch(() => {}); }}
      onContextMenu={openLinkContextMenu}
      disabled={disabled}
      className={`flex items-center gap-2 px-4 py-2.5 text-[12px]
        focus:outline-none focus-visible:ring-1 focus-visible:ring-blue-400
        transition-colors w-full text-left
        ${disabled
          ? "text-gray-300 dark:text-gray-600 cursor-not-allowed"
          : "text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800"
        }`}
    >
      {icon}
      {label}
    </button>
  );
}

function ExternalIcon() {
  return (
    <svg
      className="h-3.5 w-3.5 shrink-0 text-gray-400 dark:text-gray-500"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={2}
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25"
      />
    </svg>
  );
}

export default function AboutSection() {
  const { t } = useTranslation();
  const [appVersion, setAppVersion] = useState("");

  useEffect(() => {
    getVersion().then(setAppVersion);
  }, []);

  return (
    <SettingsPage title={t("aboutSection.title")}>
      <SettingsCard>
        <div className="text-[15px] font-semibold text-gray-800 dark:text-gray-200">
          {t("aboutSection.appName")}
        </div>
        <div className="text-[12px] text-gray-500 dark:text-gray-400">
          {appVersion && t("aboutSection.version", { version: appVersion })}
        </div>
        <div className="mt-2 text-[12px] text-gray-400 dark:text-gray-500">
          {t("aboutSection.appDescription")}
        </div>
      </SettingsCard>

      <SettingsList>
        <LinkButton
          label={t("aboutSection.githubRepo")}
          href="https://github.com/Engazan/KimaiTray"
          icon={<ExternalIcon />}
        />
        <LinkButton
          label={t("aboutSection.website")}
          href="https://kimaitray.app"
          icon={<ExternalIcon />}
          disabled
        />
        <LinkButton
          label={t("aboutSection.reportIssue")}
          href="https://github.com/Engazan/KimaiTray/issues"
          icon={<ExternalIcon />}
        />
        <LinkButton
          label={t("aboutSection.privacyPolicy")}
          href="https://kimaitray.app/privacy"
          icon={<ExternalIcon />}
          disabled
        />
      </SettingsList>

      <SettingsCard title={t("aboutSection.supportTitle")}>
        <p className="mb-3 text-[12px] text-gray-400 dark:text-gray-500">
          {t("aboutSection.supportDescription")}
        </p>
        <div className="flex flex-wrap gap-2">
          <DonateButton
            label="Ko-fi"
            color="#FF5E5B"
            href="https://ko-fi.com/kimaitray"
            disabled
          />
          <DonateButton
            label="GitHub Sponsors"
            color="#db61a2"
            href="https://github.com/sponsors/engazan"
          />
          <DonateButton
            label="Buy Me a Coffee"
            color="#FFDD00"
            textDark
            href="https://buymeacoffee.com/kimaitray"
            disabled
          />
        </div>
      </SettingsCard>

      <div className="px-1 text-[11px] text-gray-300 dark:text-gray-600">
        {t("aboutSection.copyright")}
      </div>
    </SettingsPage>
  );
}

function DonateButton({
  label,
  color,
  textDark,
  href,
  disabled,
}: {
  label: string;
  color: string;
  textDark?: boolean;
  href: string;
  disabled?: boolean;
}) {
  const { t } = useTranslation();
  /* v8 ignore start -- callback executes from a native OS context menu */
  const openLinkContextMenu = (event: ReactMouseEvent<HTMLElement>) => {
    if (disabled) return;
    void showContextMenu(event, [
      { text: t("contextMenu.openLink"), action: () => { void openUrl(href); } },
      separator(),
      { text: t("contextMenu.copyLink"), action: () => { void navigator.clipboard.writeText(href); } },
    ]);
  };
  /* v8 ignore stop */
  return (
    <button
      type="button"
      onClick={disabled ? undefined : () => openUrl(href).catch(() => {})}
      onContextMenu={openLinkContextMenu}
      disabled={disabled}
      className={`rounded-md px-3 py-1.5 text-[12px] font-medium transition-opacity
        focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-1 focus-visible:ring-blue-400
        ${disabled ? "opacity-40 cursor-not-allowed" : "hover:opacity-85 active:opacity-75"}`}
      style={{
        backgroundColor: color,
        color: textDark ? "#1a1a1a" : "#ffffff",
      }}
    >
      {label}
    </button>
  );
}
