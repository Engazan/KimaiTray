import { useTranslation } from "react-i18next";
import type { AppSettings } from "../types";
import { ShortcutInput } from "./Controls";
import { SettingsList, SettingsPage } from "./SettingsLayout";

interface Props {
  settings: AppSettings;
  update: <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => void;
}

const SHORTCUT_KEYS = [
  { key: "shortcutTogglePopup" as const, labelKey: "shortcuts.togglePopup", descKey: "shortcuts.togglePopupDescription" },
  { key: "shortcutStartStopTimer" as const, labelKey: "shortcuts.startStopTimer", descKey: "shortcuts.startStopTimerDescription" },
  { key: "shortcutOpenSettings" as const, labelKey: "shortcuts.openSettings", descKey: "shortcuts.openSettingsDescription" },
];

function findConflict(
  currentKey: string,
  value: string,
  settings: AppSettings,
  t: (key: string, opts?: Record<string, string>) => string,
): string | null {
  if (!value) return null;
  for (const s of SHORTCUT_KEYS) {
    if (s.key !== currentKey && settings[s.key] === value) {
      return t("shortcuts.conflict", { action: t(s.labelKey) });
    }
  }
  return null;
}

export default function ShortcutsSection({ settings, update }: Props) {
  const { t } = useTranslation();

  return (
    <SettingsPage title={t("shortcuts.title")} description={t("shortcuts.description")}>
      <SettingsList>
        {SHORTCUT_KEYS.map((item) => {
          const conflict = findConflict(item.key, settings[item.key], settings, t);
          return (
            <div key={item.key} className="flex items-center justify-between gap-4 px-4 py-3">
              <div className="min-w-0">
                <div className="text-[13px] font-medium text-gray-700 dark:text-gray-200">
                  {t(item.labelKey)}
                </div>
                <div className="mt-0.5 text-[11px] leading-4 text-gray-400 dark:text-gray-500">
                  {t(item.descKey)}
                </div>
                {conflict && (
                  <div className="mt-1 text-[11px] text-red-500 dark:text-red-400">
                    {conflict}
                  </div>
                )}
              </div>
              <div className="shrink-0">
                <ShortcutInput
                  value={settings[item.key]}
                  onChange={(v) => update(item.key, v)}
                />
              </div>
            </div>
          );
        })}
      </SettingsList>
    </SettingsPage>
  );
}
