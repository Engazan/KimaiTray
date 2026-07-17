import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Window } from "@tauri-apps/api/window";
import type { AppSettings } from "../types";
import { logger } from "../utils/logger";
import { NumberInput, Toggle } from "./Controls";
import { SettingsList, SettingsPage, SettingsRow } from "./SettingsLayout";

interface Props {
  settings: AppSettings;
  update: <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => void;
}

export default function TimerReminderSection({ settings, update }: Props) {
  const { t } = useTranslation();
  const [testing, setTesting] = useState(false);

  const testReminder = async () => {
    setTesting(true);
    try {
      const reminder = await Window.getByLabel("timer-reminder");
      if (!reminder) return;
      await reminder.setSimpleFullscreen(true);
      await reminder.show();
      await reminder.setFocus();
    } catch (error) {
      logger.error(`Failed to test timer reminder: ${String(error)}`);
    } finally {
      setTesting(false);
    }
  };

  return (
    <SettingsPage
      title={t("timerReminder.title")}
      description={t("timerReminder.description")}
    >
      <SettingsList>
        <SettingsRow
          label={t("timerReminder.enable")}
          description={t("timerReminder.enableDescription")}
        >
          <Toggle
            checked={settings.enableNoTimerReminder}
            onChange={(value) => update("enableNoTimerReminder", value)}
          />
        </SettingsRow>

        <SettingsRow
          label={t("timerReminder.threshold")}
          description={t("timerReminder.thresholdDescription")}
        >
          <NumberInput
            value={settings.noTimerReminderMinutes}
            onChange={(value) => update("noTimerReminderMinutes", value)}
            min={1}
            max={1440}
            suffix="min"
            disabled={!settings.enableNoTimerReminder}
          />
        </SettingsRow>

        <SettingsRow
          label={t("timerReminder.test")}
          description={t("timerReminder.testDescription")}
        >
          <button
            type="button"
            disabled={testing}
            onClick={() => void testReminder()}
            className="rounded-md border border-gray-200 bg-gray-50 px-3 py-1.5 text-[12px] font-medium text-gray-700 transition-colors hover:bg-gray-100 focus:outline-none focus-visible:ring-1 focus-visible:ring-blue-400 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {testing ? t("timerReminder.testing") : t("timerReminder.testButton")}
          </button>
        </SettingsRow>
      </SettingsList>
    </SettingsPage>
  );
}
