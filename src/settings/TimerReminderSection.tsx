import { useState } from "react";
import { useTranslation } from "react-i18next";
import type { AppSettings } from "../types";
import { showFullscreenReminder } from "../api/reminderWindow";
import { logger } from "../utils/logger";
import { NumberInput, Toggle, buttonClass } from "./Controls";
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
      await showFullscreenReminder({ kind: "timer" });
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
            ariaLabel={t("timerReminder.enable")}
            checked={settings.enableNoTimerReminder}
            onChange={(value) => update("enableNoTimerReminder", value)}
          />
        </SettingsRow>

        <SettingsRow
          label={t("timerReminder.threshold")}
          description={t("timerReminder.thresholdDescription")}
          dimmed={!settings.enableNoTimerReminder}
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
            className={buttonClass()}
          >
            {testing ? t("timerReminder.testing") : t("timerReminder.testButton")}
          </button>
        </SettingsRow>
      </SettingsList>
    </SettingsPage>
  );
}
