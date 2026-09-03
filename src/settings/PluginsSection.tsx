import { useCallback } from "react";
import { useTranslation } from "react-i18next";
import type {
  AppSettings,
  PluginSettings,
  TimesheetCustomFieldDefinition,
} from "../types";
import { Toggle } from "./Controls";
import { SettingsCard, SettingsList, SettingsRow } from "./SettingsLayout";
import { defaultPluginSettings } from "./service";

interface Props {
  settings: AppSettings;
  update: <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => void;
  connectionId: string;
}

export default function PluginsSection({ settings, update, connectionId }: Props) {
  const { t } = useTranslation();
  const config = settings.plugins[connectionId] ?? defaultPluginSettings;
  const customFields = settings.timesheetCustomFields[connectionId] ?? [];

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

  const updateCustomFields = useCallback(
    (fields: TimesheetCustomFieldDefinition[]) => {
      if (!connectionId) return;
      update("timesheetCustomFields", {
        ...settings.timesheetCustomFields,
        [connectionId]: fields,
      });
    },
    [connectionId, settings.timesheetCustomFields, update],
  );

  const updateCustomField = <K extends keyof TimesheetCustomFieldDefinition>(
    index: number,
    key: K,
    value: TimesheetCustomFieldDefinition[K],
  ) => {
    updateCustomFields(
      customFields.map((field, fieldIndex) =>
        fieldIndex === index ? { ...field, [key]: value } : field,
      ),
    );
  };

  const addCustomField = () => {
    let suffix = customFields.length + 1;
    let name = `custom_field_${suffix}`;
    while (customFields.some((field) => field.name === name)) {
      suffix += 1;
      name = `custom_field_${suffix}`;
    }
    updateCustomFields([
      ...customFields,
      { name, label: t("customFields.defaultLabel"), type: "text", required: false },
    ]);
  };

  return (
    <div className="space-y-4">
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

      <SettingsCard
        title={t("customFields.title")}
        description={t("customFields.description")}
        className="space-y-3"
      >
        {customFields.map((field, index) => {
          const duplicate = customFields.some(
            (candidate, candidateIndex) =>
              candidateIndex !== index && candidate.name === field.name,
          );
          const invalidName = !/^[a-z0-9_-]{2,50}$/.test(field.name);
          return (
            <div
              key={index}
              className="group relative overflow-hidden rounded-xl border border-gray-200 bg-gray-50/60 p-3.5 transition-colors hover:border-gray-300 dark:border-gray-700 dark:bg-white/[0.025] dark:hover:border-gray-600"
            >
              <div className="mb-3 flex items-center justify-between gap-3">
                <div className="flex min-w-0 items-center gap-2">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-[var(--accent-light)] text-[var(--accent)]">
                    <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 6.75A2.25 2.25 0 016.75 4.5h10.5a2.25 2.25 0 012.25 2.25v10.5a2.25 2.25 0 01-2.25 2.25H6.75a2.25 2.25 0 01-2.25-2.25V6.75zM8 9h8M8 13h5" />
                    </svg>
                  </span>
                  <span className="truncate text-[11px] font-medium text-gray-500 dark:text-gray-400">
                    {field.label.trim() || field.name}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => updateCustomFields(customFields.filter((_, fieldIndex) => fieldIndex !== index))}
                  aria-label={t("customFields.remove")}
                  title={t("customFields.remove")}
                  className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-gray-400 transition-colors hover:bg-red-50 hover:text-red-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-400 dark:text-gray-500 dark:hover:bg-red-950/30 dark:hover:text-red-400"
                >
                  <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 3.75h6m-9 3h12m-10.5 0 .75 12a1.5 1.5 0 001.5 1.5h4.5a1.5 1.5 0 001.5-1.5l.75-12M10 10.5v6m4-6v6" />
                  </svg>
                </button>
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <label className="text-[10px] font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500">
                  {t("customFields.internalName")}
                  <input
                    value={field.name}
                    aria-invalid={invalidName || duplicate || undefined}
                    onChange={(event) => {
                      const name = event.target.value.trim().toLowerCase();
                      if (!/^[a-z0-9_-]{2,50}$/.test(name)) return;
                      if (customFields.some((candidate, candidateIndex) => candidateIndex !== index && candidate.name === name)) return;
                      updateCustomField(index, "name", name);
                    }}
                    spellCheck={false}
                    className="mt-1.5 w-full rounded-lg border border-gray-200 bg-white px-3 py-2 font-mono text-[12px] font-normal tracking-normal text-gray-700 shadow-sm shadow-gray-200/30 transition-colors placeholder:text-gray-400 focus:border-[var(--accent)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]/15 aria-[invalid=true]:border-red-400 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200 dark:shadow-none"
                  />
                </label>
                <label className="text-[10px] font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500">
                  {t("customFields.label")}
                  <input
                    value={field.label}
                    onChange={(event) => updateCustomField(index, "label", event.target.value)}
                    className="mt-1.5 w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-[12px] font-normal normal-case tracking-normal text-gray-700 shadow-sm shadow-gray-200/30 transition-colors placeholder:text-gray-400 focus:border-[var(--accent)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]/15 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200 dark:shadow-none"
                  />
                </label>

                <div>
                  <span className="block text-[10px] font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500">
                    {t("customFields.type")}
                  </span>
                  <div
                    role="group"
                    aria-label={t("customFields.type")}
                    className="mt-1.5 grid grid-cols-2 rounded-lg border border-gray-200 bg-gray-100 p-0.5 dark:border-gray-700 dark:bg-gray-900/70"
                  >
                    {(["text", "url"] as const).map((type) => {
                      const active = field.type === type;
                      return (
                        <button
                          key={type}
                          type="button"
                          aria-pressed={active}
                          onClick={() => updateCustomField(index, "type", type)}
                          className={`flex items-center justify-center gap-1.5 rounded-md px-2 py-1.5 text-[11px] font-medium transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] ${
                            active
                              ? "bg-white text-gray-700 shadow-sm dark:bg-gray-700 dark:text-gray-100"
                              : "text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300"
                          }`}
                        >
                          {type === "url" && (
                            <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 13.5l3-3m-5.25 6.75-1.5 1.5a3.182 3.182 0 01-4.5-4.5l3-3a3.182 3.182 0 014.5 0m6-4.5 1.5-1.5a3.182 3.182 0 014.5 4.5l-3 3a3.182 3.182 0 01-4.5 0" />
                            </svg>
                          )}
                          {t(type === "url" ? "customFields.url" : "customFields.text")}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="flex items-end">
                  <div className="flex w-full items-center justify-between rounded-lg border border-gray-200 bg-white px-3 py-2 dark:border-gray-700 dark:bg-gray-800">
                    <div>
                      <div className="text-[11px] font-medium text-gray-600 dark:text-gray-300">
                        {t("customFields.required")}
                      </div>
                      <div className="text-[9px] text-gray-400 dark:text-gray-500">
                        {t("customFields.requiredHint")}
                      </div>
                    </div>
                    <Toggle
                      checked={field.required}
                      ariaLabel={t("customFields.required")}
                      onChange={(value) => updateCustomField(index, "required", value)}
                    />
                  </div>
                </div>
              </div>
              {(invalidName || duplicate || !field.label.trim()) && (
                <p className="mt-2 text-[10px] text-red-500">
                  {duplicate ? t("customFields.duplicateName") : t("customFields.invalidDefinition")}
                </p>
              )}
            </div>
          );
        })}
        <button
          type="button"
          onClick={addCustomField}
          aria-label={t("customFields.add")}
          className="group/add flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-gray-300 bg-gray-50/50 px-3 py-2.5 text-[11px] font-medium text-gray-500 transition-colors hover:border-[var(--accent)] hover:bg-[var(--accent-light)] hover:text-[var(--accent)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] dark:border-gray-700 dark:bg-white/[0.02] dark:text-gray-400 dark:hover:border-[var(--accent)] dark:hover:text-[var(--accent)]"
        >
          <span className="flex h-5 w-5 items-center justify-center rounded-md border border-current text-[14px] leading-none transition-transform group-hover/add:scale-105">+</span>
          {t("customFields.add")}
        </button>
      </SettingsCard>
    </div>
  );
}
