import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import type { AppSettings } from "../types";
import { ShortcutInput } from "./Controls";
import { SettingsList, SettingsNote, SettingsPage, SettingsRow, SettingsWarning } from "./SettingsLayout";
import { usePlatform } from "../platform";

interface Props {
  settings: AppSettings;
  update: <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => void;
}

const SHORTCUT_KEYS = [
  { key: "shortcutTogglePopup" as const, labelKey: "shortcuts.togglePopup", descKey: "shortcuts.togglePopupDescription" },
  { key: "shortcutStartStopTimer" as const, labelKey: "shortcuts.startStopTimer", descKey: "shortcuts.startStopTimerDescription" },
  { key: "shortcutNewTask" as const, labelKey: "shortcuts.newTask", descKey: "shortcuts.newTaskDescription" },
  { key: "shortcutPauseResume" as const, labelKey: "shortcuts.pauseResume", descKey: "shortcuts.pauseResumeDescription" },
  { key: "shortcutContinueLastTask" as const, labelKey: "shortcuts.continueLastTask", descKey: "shortcuts.continueLastTaskDescription" },
  { key: "shortcutEditNote" as const, labelKey: "shortcuts.editNote", descKey: "shortcuts.editNoteDescription" },
  { key: "shortcutOpenKimai" as const, labelKey: "shortcuts.openKimai", descKey: "shortcuts.openKimaiDescription" },
  { key: "shortcutOpenSettings" as const, labelKey: "shortcuts.openSettings", descKey: "shortcuts.openSettingsDescription" },
];

function findConflict(
  currentKey: string,
  value: string,
  settings: AppSettings,
  t: TFunction,
): string | null {
  if (!value) return null;
  for (const s of SHORTCUT_KEYS) {
    if (s.key !== currentKey && settings[s.key] === value) {
      return t("shortcuts.conflict", { action: t(s.labelKey) });
    }
  }
  return null;
}

const SHORTCUT_GROUPS: { titleKey: string; keys: (typeof SHORTCUT_KEYS)[number]["key"][] }[] = [
  {
    titleKey: "shortcuts.groupTimer",
    keys: ["shortcutStartStopTimer", "shortcutNewTask", "shortcutPauseResume", "shortcutContinueLastTask", "shortcutEditNote"],
  },
  {
    titleKey: "shortcuts.groupWindows",
    keys: ["shortcutTogglePopup", "shortcutOpenKimai", "shortcutOpenSettings"],
  },
];

export default function ShortcutsSection({ settings, update }: Props) {
  const { t } = useTranslation();
  const platform = usePlatform();

  return (
    <SettingsPage title={t("shortcuts.title")} description={t("shortcuts.description")}>
      {!platform.supportsGlobalShortcuts && (
        <SettingsWarning>{t("shortcuts.waylandUnavailable")}</SettingsWarning>
      )}
      {SHORTCUT_GROUPS.map((group) => (
        <SettingsList key={group.titleKey} title={t(group.titleKey)}>
          {group.keys.map((key) => {
            const item = SHORTCUT_KEYS.find((s) => s.key === key)!;
            const conflict = findConflict(item.key, settings[item.key], settings, t);
            return (
              <SettingsRow
                key={item.key}
                label={t(item.labelKey)}
                description={
                  <>
                    {t(item.descKey)}
                    {conflict && (
                      <span className="mt-1 block text-red-500 dark:text-red-400">
                        {conflict}
                      </span>
                    )}
                  </>
                }
              >
                <ShortcutInput
                  disabled={!platform.supportsGlobalShortcuts}
                  value={settings[item.key]}
                  onChange={(v) => update(item.key, v)}
                />
              </SettingsRow>
            );
          })}
        </SettingsList>
      ))}
      <SettingsNote>{t("shortcuts.formSubmitHint")}</SettingsNote>
    </SettingsPage>
  );
}
