import { useTranslation } from "react-i18next";
import type { AppSettings } from "../types";
import { usePlatform } from "../hooks/usePlatform";
import { ShortcutInput } from "./Controls";
import { SettingsList, SettingsPage, SettingsRow } from "./SettingsLayout";

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
  const platform = usePlatform();
  // Global shortcuts are X11 key grabs; on Wayland the compositor never
  // delivers them, so the keys silently do nothing. Disable and annotate.
  const unavailable = platform?.wayland ?? false;

  return (
    <SettingsPage title={t("shortcuts.title")} description={t("shortcuts.description")}>
      {unavailable && (
        <div className="rounded-lg border border-amber-300/60 bg-amber-50 px-3 py-2 text-[11px] text-amber-700 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-400">
          {t("shortcuts.waylandUnavailable")}
        </div>
      )}
      <SettingsList>
        {SHORTCUT_KEYS.map((item) => {
          const conflict = findConflict(item.key, settings[item.key], settings, t);
          return (
            <SettingsRow
              key={item.key}
              label={t(item.labelKey)}
              description={
                <>
                  {t(item.descKey)}
                  {conflict && !unavailable && (
                    <span className="mt-1 block text-red-500 dark:text-red-400">
                      {conflict}
                    </span>
                  )}
                </>
              }
            >
              <ShortcutInput
                value={settings[item.key]}
                onChange={(v) => update(item.key, v)}
                disabled={unavailable}
              />
            </SettingsRow>
          );
        })}
      </SettingsList>
    </SettingsPage>
  );
}
