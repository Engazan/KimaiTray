import { useState } from "react";
import { useTranslation } from "react-i18next";
import type { AppSettings } from "../types";
import { showFullscreenReminder } from "../api/reminderWindow";
import { logger } from "../utils/logger";
import { NumberInput, Select, Toggle } from "./Controls";
import { SettingsList, SettingsPage, SettingsRow } from "./SettingsLayout";

interface Props {
  settings: AppSettings;
  update: <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => void;
}

export default function IdleDetectionSection({ settings, update }: Props) {
  const { t } = useTranslation();
  const [testing, setTesting] = useState(false);

  const testIdleReminder = async () => {
    setTesting(true);
    const idleDurationSeconds = settings.idleThresholdMinutes * 60;
    try {
      await showFullscreenReminder({
        kind: "idle",
        test: true,
        idleStartedAtIso: new Date(
          Date.now() - idleDurationSeconds * 1000,
        ).toISOString(),
        idleDurationSeconds,
        project: t("idle.testProject"),
        activity: t("idle.testActivity"),
        processing: false,
        error: null,
      });
    } catch (error) {
      logger.error(`Failed to test idle reminder: ${String(error)}`);
    } finally {
      setTesting(false);
    }
  };

  return (
    <SettingsPage title={t("idle.title")} description={t("idle.description")}>
      <SettingsList>
        <SettingsRow label={t("idle.enableIdle")} description={t("idle.enableIdleDescription")}>
          <Toggle
            checked={settings.enableIdleDetection}
            onChange={(v) => update("enableIdleDetection", v)}
          />
        </SettingsRow>

        <SettingsRow label={t("idle.idleThreshold")} description={t("idle.idleThresholdDescription")}>
          <NumberInput
            value={settings.idleThresholdMinutes}
            onChange={(v) => update("idleThresholdMinutes", v)}
            min={1}
            max={60}
            suffix="min"
            disabled={!settings.enableIdleDetection}
          />
        </SettingsRow>

        <SettingsRow label={t("idle.whenIdle")} description={t("idle.whenIdleDescription")}>
          <Select
            value={settings.idleAction}
            onChange={(v) => update("idleAction", v as AppSettings["idleAction"])}
            options={[
              { value: "ask", label: t("idle.askMe") },
              { value: "stop", label: t("idle.stopTimer") },
              { value: "discard", label: t("idle.discardIdleTime") },
              { value: "continue", label: t("idle.keepRunning") },
            ]}
            disabled={!settings.enableIdleDetection}
          />
        </SettingsRow>

        <SettingsRow label={t("idle.showNotification")} description={t("idle.showNotificationDescription")}>
          <Toggle
            checked={settings.showIdleNotification}
            onChange={(v) => update("showIdleNotification", v)}
            disabled={!settings.enableIdleDetection}
          />
        </SettingsRow>

        <SettingsRow
          label={t("idle.testReminder")}
          description={t("idle.testReminderDescription")}
        >
          <button
            type="button"
            disabled={testing}
            onClick={() => void testIdleReminder()}
            className="rounded-md border border-gray-200 bg-gray-50 px-3 py-1.5 text-[12px] font-medium text-gray-700 transition-colors hover:bg-gray-100 focus:outline-none focus-visible:ring-1 focus-visible:ring-blue-400 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {testing ? t("idle.testingReminder") : t("idle.testReminderButton")}
          </button>
        </SettingsRow>
      </SettingsList>
    </SettingsPage>
  );
}
