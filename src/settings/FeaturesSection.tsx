import { useCallback } from "react";
import { useTranslation } from "react-i18next";
import type { AppSettings, FeatureSettings } from "../types";
import { defaultFeatureSettings } from "./service";
import {
  Divider,
  FieldGroup,
  SectionDescription,
  Toggle,
} from "./Controls";

interface Props {
  settings: AppSettings;
  update: <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => void;
  /** Connection whose features are being configured. Empty for a
   *  not-yet-saved connection. */
  connectionId: string;
}

export default function FeaturesSection({ settings, update, connectionId }: Props) {
  const { t } = useTranslation();
  const config = settings.features[connectionId] ?? defaultFeatureSettings;

  const updateFeature = useCallback(
    <K extends keyof FeatureSettings>(key: K, value: FeatureSettings[K]) => {
      if (!connectionId) return;
      const current = settings.features[connectionId] ?? defaultFeatureSettings;
      update("features", {
        ...settings.features,
        [connectionId]: { ...current, [key]: value },
      });
    },
    [connectionId, settings.features, update],
  );

  return (
    <div>
      <SectionDescription>
        {t("featuresSettings.description")}
      </SectionDescription>

      {!connectionId ? (
        <div className="rounded-lg border border-dashed border-gray-200 bg-gray-50 px-4 py-5 text-center text-[12px] text-gray-500 dark:border-gray-700 dark:bg-gray-800/50 dark:text-gray-400">
          {t("connection.saveFirstForFeatures")}
        </div>
      ) : (
        <>
          <FieldGroup label={t("featuresSettings.note")} description={t("featuresSettings.noteDescription")} horizontal>
            <Toggle
              checked={config.featureNote}
              onChange={(v) => updateFeature("featureNote", v)}
            />
          </FieldGroup>

          <Divider />

          <FieldGroup label={t("featuresSettings.tags")} description={t("featuresSettings.tagsDescription")} horizontal>
            <Toggle
              checked={config.featureTags}
              onChange={(v) => updateFeature("featureTags", v)}
            />
          </FieldGroup>

          <Divider />

          <FieldGroup label={t("featuresSettings.pausedDescriptionHover")} description={t("featuresSettings.pausedDescriptionHoverDescription")} horizontal>
            <Toggle
              checked={config.featurePausedTimerDescriptionHover}
              onChange={(v) => updateFeature("featurePausedTimerDescriptionHover", v)}
            />
          </FieldGroup>

          <Divider />

          <FieldGroup label={t("featuresSettings.customerSelect")} description={t("featuresSettings.customerSelectDescription")} horizontal>
            <Toggle
              checked={config.featureCustomerSelect}
              onChange={(v) => updateFeature("featureCustomerSelect", v)}
            />
          </FieldGroup>

          <Divider />

          <FieldGroup label={t("featuresSettings.customStartTime")} description={t("featuresSettings.customStartTimeDescription")} horizontal>
            <Toggle
              checked={config.featureCustomStartTime}
              onChange={(v) => updateFeature("featureCustomStartTime", v)}
            />
          </FieldGroup>
        </>
      )}
    </div>
  );
}
