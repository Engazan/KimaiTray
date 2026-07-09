import { useTranslation } from "react-i18next";
import type { AppSettings } from "../types";
import { NumberInput, Select, Toggle } from "./Controls";
import { SettingsList, SettingsPage, SettingsRow } from "./SettingsLayout";

interface Props {
  settings: AppSettings;
  update: <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => void;
}

export default function IdleDetectionSection({ settings, update }: Props) {
  const { t } = useTranslation();

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
      </SettingsList>
    </SettingsPage>
  );
}
