import IdleStatistics from "./IdleStatistics";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import type { AppSettings } from "../types";
import { showFullscreenReminder } from "../api/reminderWindow";
import { logger } from "../utils/logger";
import { usePlatform } from "../platform";
import { NumberInput, Segmented, Toggle, buttonClass } from "./Controls";
import { Badge, SettingsList, SettingsPage, SettingsRow, SettingsRowStacked } from "./SettingsLayout";

interface Props {
  settings: AppSettings;
  update: <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => void;
}

export default function IdleDetectionSection({ settings, update }: Props) {
  const { t } = useTranslation();
  const { os } = usePlatform();
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

  const on = settings.enableIdleDetection;

  return (
    <SettingsPage title={t("idle.title")} description={t("idle.description")}>
      <SettingsList title={t("idle.detectionGroup")}>
        <SettingsRow label={t("idle.enableIdle")} description={t("idle.enableIdleDescription")}>
          <Toggle
            ariaLabel={t("idle.enableIdle")}
            checked={on}
            onChange={(v) => update("enableIdleDetection", v)}
          />
        </SettingsRow>

        <SettingsRow label={t("idle.idleThreshold")} description={t("idle.idleThresholdDescription")} dimmed={!on}>
          <NumberInput
            value={settings.idleThresholdMinutes}
            onChange={(v) => update("idleThresholdMinutes", v)}
            min={1}
            max={60}
            suffix="min"
            disabled={!on}
          />
        </SettingsRow>

        <SettingsRowStacked label={t("idle.whenIdle")} description={t("idle.whenIdleDescription")} dimmed={!on}>
          <Segmented
            ariaLabel={t("idle.whenIdle")}
            value={settings.idleAction}
            onChange={(v) => update("idleAction", v)}
            options={[
              { value: "ask", label: t("idle.askMe") },
              { value: "stop", label: t("idle.stopTimer") },
              { value: "discard", label: t("idle.discardIdleTime") },
              { value: "continue", label: t("idle.keepRunning") },
            ]}
            disabled={!on}
          />
        </SettingsRowStacked>

        <SettingsRow label={t("idle.showNotification")} description={t("idle.showNotificationDescription")} dimmed={!on}>
          <Toggle
            ariaLabel={t("idle.showNotification")}
            checked={settings.showIdleNotification}
            onChange={(v) => update("showIdleNotification", v)}
            disabled={!on}
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
            className={buttonClass()}
          >
            {testing ? t("idle.testingReminder") : t("idle.testReminderButton")}
          </button>
        </SettingsRow>
      </SettingsList>

      <SettingsList title={t("idle.autoStopGroup")}>
        {os === "macos" && (
          <>
            <SettingsRow
              label={t("idle.stopOnScreensaver")}
              description={t("idle.stopOnScreensaverDescription")}
              badge={<Badge>macOS</Badge>}
            >
              <Toggle
                ariaLabel={t("idle.stopOnScreensaver")}
                checked={settings.stopTimerOnScreensaver}
                onChange={(v) => update("stopTimerOnScreensaver", v)}
              />
            </SettingsRow>
            <SettingsRow
              label={t("idle.stopOnScreenLock")}
              description={t("idle.stopOnScreenLockDescription")}
              badge={<Badge>macOS</Badge>}
            >
              <Toggle
                ariaLabel={t("idle.stopOnScreenLock")}
                checked={settings.stopTimerOnScreenLock}
                onChange={(v) => update("stopTimerOnScreenLock", v)}
              />
            </SettingsRow>
          </>
        )}

        <SettingsRow
          label={t("idle.stopOnShutdown")}
          description={t("idle.stopOnShutdownDescription")}
        >
          <Toggle
            ariaLabel={t("idle.stopOnShutdown")}
            checked={settings.stopTimerOnShutdown}
            onChange={(value) => update("stopTimerOnShutdown", value)}
          />
        </SettingsRow>
      </SettingsList>

      <SettingsList title={t("idle.statsTitle")}>
        <SettingsRow label={t("idle.statsRetention")} description={t("idle.statsRetentionDescription")}>
          <NumberInput
            value={settings.idleStatsRetentionDays}
            onChange={(v) => update("idleStatsRetentionDays", v)}
            min={1}
            max={365}
            suffix={t("idle.statsDays")}
          />
        </SettingsRow>
      </SettingsList>
      <div className="-mt-3">
        <IdleStatistics retentionDays={settings.idleStatsRetentionDays} />
      </div>
    </SettingsPage>
  );
}
