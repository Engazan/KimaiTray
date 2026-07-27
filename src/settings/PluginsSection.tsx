import { useCallback } from "react";
import { useTranslation } from "react-i18next";
import type { AppSettings, PluginSettings } from "../types";
import { Toggle } from "./Controls";
import { SettingsList, SettingsRow } from "./SettingsLayout";
import { defaultPluginSettings } from "./service";

interface Props {
  settings: AppSettings;
  update: <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => void;
  connectionId: string;
}

export default function PluginsSection({ settings, update, connectionId }: Props) {
  const { t } = useTranslation();
  const config = settings.plugins[connectionId] ?? defaultPluginSettings;

  const updatePlugin = useCallback(
    <K extends keyof PluginSettings>(key: K, value: PluginSettings[K]) => {
      if (!connectionId) return;
      const current = settings.plugins[connectionId] ?? defaultPluginSettings;
      update("plugins", {
        ...settings.plugins,
        [connectionId]: { ...current, [key]: value },
      });
    },
    [connectionId, settings.plugins, update],
  );

  return (
    <SettingsList>
      <SettingsRow
        label={t("plugins.creativeIssueLink")}
        description={t("plugins.author", { author: "Creativesites s.r.o." })}
      >
        <Toggle
          checked={config.creativeIssueLink}
          onChange={(value) => updatePlugin("creativeIssueLink", value)}
        />
      </SettingsRow>
    </SettingsList>
  );
}
