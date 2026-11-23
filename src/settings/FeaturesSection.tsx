import { useCallback, useState } from "react";
import { useTranslation } from "react-i18next";
import type { AppSettings, FeatureSettings } from "../types";
import { defaultFeatureSettings } from "./service";
import CategoryModeSettingsSection from "../categorymode/CategoryModeSettingsSection";
import { Toggle } from "./Controls";
import { SettingsList, SettingsRow } from "./SettingsLayout";
import { ChevronLeft, ChevronRight } from "./icons";

interface Props {
  settings: AppSettings;
  update: <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => void;
  /** Connection whose features are being configured. Empty for a
   *  not-yet-saved connection. */
  connectionId: string;
}

function GoalTimeInput({
  value,
  onChange,
  hoursLabel,
  minutesLabel,
  minMinutes = 15,
}: {
  value: number;
  onChange: (value: number) => void;
  hoursLabel: string;
  minutesLabel: string;
  minMinutes?: number;
}) {
  const hours = Math.floor(value / 60);
  const minutes = value % 60;
  const update = (nextHours: number, nextMinutes: number) => {
    if (!Number.isFinite(nextHours) || !Number.isFinite(nextMinutes)) return;
    const total = Math.round(nextHours) * 60 + Math.round(nextMinutes);
    onChange(Math.min(1440, Math.max(minMinutes, total)));
  };

  return (
    <div className="flex items-center gap-1.5">
      <label className="flex items-center gap-1">
        <span className="sr-only">{hoursLabel}</span>
        <input
          type="number"
          value={hours}
          min={0}
          max={24}
          aria-label={hoursLabel}
          onChange={(event) => update(Number(event.target.value), minutes)}
          className="w-14 rounded-md border border-[var(--s-line)] bg-[var(--s-card)] px-2 py-1.5 text-center text-[13px] tabular-nums text-gray-800 focus:border-[var(--accent)] focus:outline-none focus:shadow-[0_0_0_3px_var(--accent-soft)]  dark:text-gray-200"
        />
        <span className="text-[11px] text-[var(--s-fg-subtle)]">h</span>
      </label>
      <label className="flex items-center gap-1">
        <span className="sr-only">{minutesLabel}</span>
        <input
          type="number"
          value={minutes}
          min={0}
          max={59}
          aria-label={minutesLabel}
          onChange={(event) => update(hours, Number(event.target.value))}
          className="w-14 rounded-md border border-[var(--s-line)] bg-[var(--s-card)] px-2 py-1.5 text-center text-[13px] tabular-nums text-gray-800 focus:border-[var(--accent)] focus:outline-none focus:shadow-[0_0_0_3px_var(--accent-soft)]  dark:text-gray-200"
        />
        <span className="text-[11px] text-[var(--s-fg-subtle)]">min</span>
      </label>
    </div>
  );
}

export default function FeaturesSection({ settings, update, connectionId }: Props) {
  const { t } = useTranslation();
  const config = {
    ...defaultFeatureSettings,
    ...(settings.features[connectionId] ?? {}),
  };
  const conn = settings.connections.find((c) => c.id === connectionId);
  const [categoryEditorOpen, setCategoryEditorOpen] = useState(false);

  const updateFeature = useCallback(
    <K extends keyof FeatureSettings>(key: K, value: FeatureSettings[K]) => {
      const current = {
        ...defaultFeatureSettings,
        ...(settings.features[connectionId] ?? {}),
      };
      update("features", {
        ...settings.features,
        [connectionId]: { ...current, [key]: value },
      });
    },
    [connectionId, settings.features, update],
  );

  const updateFeatures = useCallback(
    (values: Partial<FeatureSettings>) => {
      const current = {
        ...defaultFeatureSettings,
        ...(settings.features[connectionId] ?? {}),
      };
      update("features", {
        ...settings.features,
        [connectionId]: { ...current, ...values },
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
          className="mb-4 flex items-center gap-1.5 rounded text-[12px] font-medium text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 transition-colors focus:outline-none focus-visible:ring-1 focus-visible:ring-[var(--accent)]"
        >
          <ChevronLeft />
          {t("featuresSettings.title")}
        </button>
        <div className="mb-5">
          <h2 className="text-[17px] font-semibold text-[var(--s-fg)]">
            {t("featuresSettings.categoryModeConfigure")}
          </h2>
          <p className="mt-1 text-[12.5px] leading-5 text-[var(--s-fg-muted)]">
            {t("featuresSettings.categoryModeConfigureHint")}
          </p>
        </div>
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
      <div className="space-y-[22px]">
        <p className="text-[12.5px] leading-5 text-[var(--s-fg-muted)]">
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
      <SettingsList title={t("featuresSettings.taskFormGroup")} description={t("featuresSettings.description")}>
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

      </SettingsList>

      <SettingsList>
        <SettingsRow
          label={t("featuresSettings.dailyGoal")}
          description={t("featuresSettings.dailyGoalDescription")}
        >
          <Toggle
            checked={config.featureDailyGoal}
            onChange={(value) => updateFeature("featureDailyGoal", value)}
          />
        </SettingsRow>
        {config.featureDailyGoal && (
          <>
            <SettingsRow
              label={t("featuresSettings.requiredDailyGoal")}
              description={t("featuresSettings.requiredDailyGoalDescription")}
            >
              <GoalTimeInput
                value={config.dailyGoalMinutes}
                hoursLabel={t("featuresSettings.requiredGoalHours")}
                minutesLabel={t("featuresSettings.requiredGoalMinutes")}
                onChange={(dailyGoalMinutes) =>
                  updateFeatures({
                    dailyGoalMinutes,
                    fullDailyGoalMinutes: Math.max(
                      dailyGoalMinutes,
                      config.fullDailyGoalMinutes,
                    ),
                  })
                }
              />
            </SettingsRow>
            <SettingsRow
              label={t("featuresSettings.fullDailyGoal")}
              description={t("featuresSettings.fullDailyGoalDescription")}
            >
              <GoalTimeInput
                value={config.fullDailyGoalMinutes}
                minMinutes={config.dailyGoalMinutes}
                hoursLabel={t("featuresSettings.fullGoalHours")}
                minutesLabel={t("featuresSettings.fullGoalMinutes")}
                onChange={(fullDailyGoalMinutes) =>
                  updateFeature(
                    "fullDailyGoalMinutes",
                    Math.max(config.dailyGoalMinutes, fullDailyGoalMinutes),
                  )
                }
              />
            </SettingsRow>
            <DailyGoalPreview
              label={t("featuresSettings.goalPreview")}
              required={config.dailyGoalMinutes}
              full={config.fullDailyGoalMinutes}
            />
          </>
        )}
      </SettingsList>

      <SettingsList>
        <SettingsRow label={t("featuresSettings.categoryMode")} description={t("featuresSettings.categoryModeDescription")}>
          <Toggle
            checked={config.featureCategoryMode}
            onChange={(v) => updateFeature("featureCategoryMode", v)}
          />
        </SettingsRow>
        {config.featureCategoryMode && (
          <button
            type="button"
            onClick={() => setCategoryEditorOpen(true)}
            className="group flex w-full items-center justify-between gap-3 px-4 py-3 text-left hover:bg-[var(--s-hover)] transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--accent)]"
          >
            <div className="flex min-w-0 items-center gap-3">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[var(--accent-light)] text-[var(--accent)]">
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 6.75h6.75v4.5H4.5v-4.5Zm8.25 0h6.75v4.5h-6.75v-4.5ZM4.5 12.75h6.75v4.5H4.5v-4.5Zm8.25 0h6.75v4.5h-6.75v-4.5Z" />
                </svg>
              </span>
              <div className="min-w-0">
                <div className="text-[13px] font-medium text-[var(--s-fg)]">
                  {t("featuresSettings.categoryModeConfigure")}
                </div>
                <div className="mt-0.5 text-[11px] leading-4 text-[var(--s-fg-subtle)]">
                  {t("featuresSettings.categoryModeConfigureHint")}
                </div>
              </div>
            </div>
            <ChevronRight className="h-4 w-4 shrink-0 text-gray-300 transition-transform group-hover:translate-x-0.5 group-hover:text-gray-500 dark:text-gray-600" />
          </button>
        )}
      </SettingsList>
    </div>
  );
}

const formatMinutes = (minutes: number) =>
  `${Math.floor(minutes / 60)}:${String(minutes % 60).padStart(2, "0")}`;

/** Sample progress bar showing how the Today tab renders both goal markers. */
function DailyGoalPreview({ label, required, full }: { label: string; required: number; full: number }) {
  const worked = Math.round(full * 0.78);
  const total = Math.max(1, full);
  return (
    <div className="bg-[var(--s-hover)] px-4 py-3" aria-hidden="true">
      <div className="mb-2 text-[11.5px] text-[var(--s-fg-subtle)]">
        {label} · <span className="font-mono">{formatMinutes(worked)}</span>
      </div>
      <div className="relative h-2 overflow-hidden rounded-[5px] bg-[var(--s-line)]">
        <i className="absolute inset-y-0 left-0 rounded-[5px] bg-[var(--accent)]" style={{ width: `${(worked / total) * 100}%` }} />
        <b className="absolute inset-y-0 w-0.5 bg-[var(--s-fg-muted)]" style={{ left: `${Math.min(100, (required / total) * 100)}%` }} />
      </div>
      <div className="mt-1.5 flex justify-between font-mono text-[11px] text-[var(--s-fg-subtle)]">
        <span>0:00</span>
        <span>{formatMinutes(required)}</span>
        <span>{formatMinutes(full)}</span>
      </div>
    </div>
  );
}
