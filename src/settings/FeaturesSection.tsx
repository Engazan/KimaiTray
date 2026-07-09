import { useCallback, useState } from "react";
import { useTranslation } from "react-i18next";
import type { AppSettings, FeatureSettings } from "../types";
import { defaultFeatureSettings } from "./service";
import CategoryModeSettingsSection from "../categorymode/CategoryModeSettingsSection";
import { SectionTitle, Toggle } from "./Controls";
import { SettingsList, SettingsRow } from "./SettingsLayout";

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
  const conn = settings.connections.find((c) => c.id === connectionId);
  const [categoryEditorOpen, setCategoryEditorOpen] = useState(false);

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

  // Dedicated sub-screen for the category editor, opened from the row button
  // below. Replaces the features list so it reads as a separate settings page.
  if (categoryEditorOpen && connectionId) {
    return (
      <div>
        <button
          type="button"
          onClick={() => setCategoryEditorOpen(false)}
          className="mb-4 flex items-center gap-1.5 rounded text-[12px] font-medium text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 transition-colors focus:outline-none focus-visible:ring-1 focus-visible:ring-blue-400"
        >
          <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
          </svg>
          {t("featuresSettings.title")}
        </button>
        <SectionTitle>{t("featuresSettings.categoryModeConfigure")}</SectionTitle>
        <CategoryModeSettingsSection
          connectionId={connectionId}
          url={conn?.url ?? ""}
          name={conn?.name}
        />
      </div>
    );
  }

  if (!connectionId) {
    return (
      <div className="space-y-4">
        <p className="text-[12.5px] leading-5 text-gray-500 dark:text-gray-400">
          {t("featuresSettings.description")}
        </p>
        <div className="rounded-lg border border-dashed border-gray-200 bg-gray-50 px-4 py-5 text-center text-[12px] text-gray-500 dark:border-gray-700 dark:bg-gray-800/50 dark:text-gray-400">
          {t("connection.saveFirstForFeatures")}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-[12.5px] leading-5 text-gray-500 dark:text-gray-400">
        {t("featuresSettings.description")}
      </p>

      <SettingsList>
        <SettingsRow label={t("featuresSettings.note")} description={t("featuresSettings.noteDescription")}>
          <Toggle checked={config.featureNote} onChange={(v) => updateFeature("featureNote", v)} />
        </SettingsRow>

        <SettingsRow label={t("featuresSettings.tags")} description={t("featuresSettings.tagsDescription")}>
          <Toggle checked={config.featureTags} onChange={(v) => updateFeature("featureTags", v)} />
        </SettingsRow>

        <SettingsRow
          label={t("featuresSettings.pausedDescriptionHover")}
          description={t("featuresSettings.pausedDescriptionHoverDescription")}
        >
          <Toggle
            checked={config.featurePausedTimerDescriptionHover}
            onChange={(v) => updateFeature("featurePausedTimerDescriptionHover", v)}
          />
        </SettingsRow>

        <SettingsRow label={t("featuresSettings.customerSelect")} description={t("featuresSettings.customerSelectDescription")}>
          <Toggle
            checked={config.featureCustomerSelect}
            onChange={(v) => updateFeature("featureCustomerSelect", v)}
          />
        </SettingsRow>

        <SettingsRow label={t("featuresSettings.customStartTime")} description={t("featuresSettings.customStartTimeDescription")}>
          <Toggle
            checked={config.featureCustomStartTime}
            onChange={(v) => updateFeature("featureCustomStartTime", v)}
          />
        </SettingsRow>

        <SettingsRow label={t("featuresSettings.categoryMode")} description={t("featuresSettings.categoryModeDescription")}>
          <Toggle
            checked={config.featureCategoryMode}
            onChange={(v) => updateFeature("featureCategoryMode", v)}
          />
        </SettingsRow>
      </SettingsList>

      {config.featureCategoryMode && (
        <button
          type="button"
          onClick={() => setCategoryEditorOpen(true)}
          className="flex w-full items-center justify-between gap-3 rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-[#181818] px-4 py-3 text-left shadow-sm shadow-gray-200/40 dark:shadow-black/10 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors focus:outline-none focus-visible:ring-1 focus-visible:ring-blue-400"
        >
          <div className="min-w-0">
            <div className="text-[13px] font-medium text-gray-700 dark:text-gray-300">
              {t("featuresSettings.categoryModeConfigure")}
            </div>
            <div className="text-[11px] text-gray-400 dark:text-gray-500">
              {t("featuresSettings.categoryModeConfigureHint")}
            </div>
          </div>
          <svg className="h-4 w-4 shrink-0 text-gray-300 dark:text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
          </svg>
        </button>
      )}
    </div>
  );
}
