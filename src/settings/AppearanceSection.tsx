import { useTranslation } from "react-i18next";
import type { AppSettings } from "../types";
import { Toggle } from "./Controls";
import {
  RadioDot,
  SelectableCard,
  SettingsCard,
  SettingsList,
  SettingsPage,
  SettingsRow,
} from "./SettingsLayout";

interface Props {
  settings: AppSettings;
  update: <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => void;
}

const accentOptions: { value: AppSettings["accentStyle"]; color: string }[] = [
  { value: "blue", color: "#3b82f6" },
  { value: "green", color: "#10b981" },
  { value: "purple", color: "#8b5cf6" },
  { value: "orange", color: "#f59e0b" },
  { value: "red", color: "#ef4444" },
];

function LayoutPreview({ layout }: { layout: AppSettings["popupLayout"] }) {
  const line = "h-[2px] rounded-full";
  const row = "h-[3px] rounded-full";
  const divider = "h-[1px] w-full bg-gray-200 dark:bg-gray-700";
  const sectionLabel = "h-[2px] w-6 rounded-full bg-gray-400/60 dark:bg-gray-500/60";
  const taskRow = `${row} bg-gray-200 dark:bg-gray-700`;
  const todayRow = "h-[3px] rounded-full bg-gray-200 dark:bg-gray-700";
  const footer = `${line} w-full bg-gray-400 dark:bg-gray-500`;
  const header = `${line} w-full bg-gray-400 dark:bg-gray-500`;
  const wrap = "w-full h-[72px] rounded-md border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-1.5 flex flex-col";

  if (layout === "classic") {
    return (
      <div className={wrap}>
        {/* Header */}
        <div className={header} />
        {/* Timer card */}
        <div className="mx-0.5 mt-1 rounded border border-emerald-300/50 dark:border-emerald-700/50 bg-emerald-50 dark:bg-emerald-950/30 px-1 py-1 flex flex-col gap-[2px]">
          <div className="flex items-center gap-1">
            <span className="h-[3px] w-[3px] rounded-full bg-emerald-400 shrink-0" />
            <div className={`${line} w-8 bg-gray-400 dark:bg-gray-500`} />
            <div className={`${line} w-4 bg-gray-300 dark:bg-gray-600`} />
          </div>
          <div className={`${line} w-10 bg-emerald-400 dark:bg-emerald-500 ml-1.5`} />
        </div>
        {/* Divider */}
        <div className={`${divider} mt-1`} />
        {/* Recent tasks section */}
        <div className="flex-1 mt-0.5 flex flex-col gap-[2px] overflow-hidden">
          <div className={sectionLabel} />
          <div className={`${taskRow} w-full`} />
          <div className={`${taskRow} w-4/5`} />
          <div className={`${taskRow} w-full`} />
        </div>
        {/* Divider */}
        <div className={divider} />
        {/* Today section */}
        <div className="mt-0.5 flex flex-col gap-[2px]">
          <div className={sectionLabel} />
          <div className="flex gap-0.5">
            <div className={`${todayRow} w-3`} />
            <div className={`${todayRow} flex-1`} />
          </div>
        </div>
        {/* Footer */}
        <div className={`${footer} mt-auto`} />
      </div>
    );
  }

  if (layout === "focus") {
    return (
      <div className={wrap}>
        {/* Header */}
        <div className={header} />
        {/* Large timer card */}
        <div className="mx-0.5 mt-1 flex-[2] rounded border border-emerald-300/50 dark:border-emerald-700/50 bg-emerald-50 dark:bg-emerald-950/30 flex flex-col items-center justify-center gap-[3px] min-h-0">
          <div className="flex items-center gap-1">
            <span className="h-[3px] w-[3px] rounded-full bg-emerald-400 shrink-0" />
            <div className={`${line} w-8 bg-gray-400 dark:bg-gray-500`} />
          </div>
          <div className="h-[5px] w-10 rounded-full bg-emerald-400 dark:bg-emerald-500" />
        </div>
        {/* Divider */}
        <div className={`${divider} mt-1`} />
        {/* Tab bar */}
        <div className="flex gap-0.5 mt-0.5 justify-center">
          <div className="h-[3px] w-7 rounded-full bg-[var(--accent)]/50" />
          <div className={`h-[3px] w-7 rounded-full bg-gray-200 dark:bg-gray-700`} />
        </div>
        {/* Tab content */}
        <div className="flex-1 mt-0.5 flex flex-col gap-[2px] overflow-hidden">
          <div className={`${taskRow} w-full`} />
          <div className={`${taskRow} w-4/5`} />
          <div className={`${taskRow} w-full`} />
        </div>
        {/* Footer */}
        <div className={`${footer} mt-auto`} />
      </div>
    );
  }

  if (layout === "taskbar") {
    return (
      <div className={wrap}>
        {/* Header */}
        <div className={header} />
        {/* Compact timer bar */}
        <div className="mx-0.5 mt-0.5 rounded border border-emerald-300/50 dark:border-emerald-700/50 bg-emerald-50 dark:bg-emerald-950/30 px-1 py-0.5 flex items-center gap-1">
          <span className="h-[3px] w-[3px] rounded-full bg-emerald-400 shrink-0" />
          <div className={`${line} w-5 bg-gray-400 dark:bg-gray-500`} />
          <div className={`${line} w-4 bg-emerald-400 dark:bg-emerald-500 ml-auto`} />
        </div>
        {/* Divider */}
        <div className={`${divider} mt-0.5`} />
        {/* Recent tasks — large area */}
        <div className="flex-1 mt-0.5 flex flex-col gap-[2px] overflow-hidden">
          <div className={sectionLabel} />
          <div className={`${taskRow} w-full`} />
          <div className={`${taskRow} w-4/5`} />
          <div className={`${taskRow} w-full`} />
          <div className={`${taskRow} w-3/4`} />
          <div className={`${taskRow} w-full`} />
        </div>
        {/* Divider */}
        <div className={divider} />
        {/* Collapsed today header with chevron */}
        <div className="mt-0.5 flex items-center justify-between">
          <div className="flex items-center gap-1">
            <div className={sectionLabel} />
            <div className={`${line} w-4 bg-gray-300 dark:bg-gray-600`} />
          </div>
          <svg className="h-[5px] w-[5px] text-gray-400 dark:text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
          </svg>
        </div>
        {/* Footer */}
        <div className={`${footer} mt-auto`} />
      </div>
    );
  }

  // Timeline
  return (
    <div className={wrap}>
      {/* Header */}
      <div className={header} />
      {/* Compact timer bar */}
      <div className="mx-0.5 mt-0.5 rounded border border-emerald-300/50 dark:border-emerald-700/50 bg-emerald-50 dark:bg-emerald-950/30 px-1 py-0.5 flex items-center gap-1">
        <span className="h-[3px] w-[3px] rounded-full bg-emerald-400 shrink-0" />
        <div className={`${line} w-5 bg-gray-400 dark:bg-gray-500`} />
        <div className={`${line} w-4 bg-emerald-400 dark:bg-emerald-500 ml-auto`} />
      </div>
      {/* Divider */}
      <div className={`${divider} mt-0.5`} />
      {/* Today section — large area */}
      <div className="flex-1 mt-0.5 flex flex-col gap-[2px] overflow-hidden">
        <div className={sectionLabel} />
        <div className="flex gap-0.5">
          <div className={`${todayRow} w-3`} />
          <div className={`${todayRow} flex-1`} />
        </div>
        <div className="flex gap-0.5">
          <div className={`${todayRow} w-3`} />
          <div className={`${todayRow} flex-1`} />
        </div>
        <div className="flex gap-0.5">
          <div className={`${todayRow} w-3`} />
          <div className={`${todayRow} flex-1`} />
        </div>
        <div className="flex gap-0.5">
          <div className={`${todayRow} w-3`} />
          <div className={`${todayRow} flex-1`} />
        </div>
      </div>
      {/* Divider */}
      <div className={divider} />
      {/* Collapsed recent tasks header with chevron */}
      <div className="mt-0.5 flex items-center justify-between">
        <div className={sectionLabel} />
        <svg className="h-[5px] w-[5px] text-gray-400 dark:text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </div>
      {/* Footer */}
      <div className={`${footer} mt-auto`} />
    </div>
  );
}

export default function AppearanceSection({ settings, update }: Props) {
  const { t } = useTranslation();

  const layoutOptions: {
    value: AppSettings["popupLayout"];
    label: string;
    description: string;
  }[] = [
    {
      value: "classic",
      label: t("appearanceSettings.layoutClassic"),
      description: t("appearanceSettings.layoutClassicDescription"),
    },
    {
      value: "focus",
      label: t("appearanceSettings.layoutFocus"),
      description: t("appearanceSettings.layoutFocusDescription"),
    },
    {
      value: "taskbar",
      label: t("appearanceSettings.layoutTaskbar"),
      description: t("appearanceSettings.layoutTaskbarDescription"),
    },
    {
      value: "timeline",
      label: t("appearanceSettings.layoutTimeline"),
      description: t("appearanceSettings.layoutTimelineDescription"),
    },
  ];

  const themeOptions: {
    value: AppSettings["theme"];
    label: string;
    description: string;
  }[] = [
    { value: "light", label: t("appearanceSettings.light"), description: t("appearanceSettings.lightDescription") },
    { value: "dark", label: t("appearanceSettings.dark"), description: t("appearanceSettings.darkDescription") },
    { value: "transparent", label: t("appearanceSettings.transparent"), description: t("appearanceSettings.transparentDescription") },
  ];

  return (
    <SettingsPage
      title={t("appearanceSettings.title")}
      description={t("appearanceSettings.description")}
    >
      <SettingsCard
        title={t("appearanceSettings.theme")}
        description={t("appearanceSettings.themeDescription")}
      >
        <div className="flex gap-2 mt-1">
          {themeOptions.map((opt) => {
            const active = settings.theme === opt.value;
            return (
              <SelectableCard
                key={opt.value}
                active={active}
                onClick={() => update("theme", opt.value)}
                className="flex-1 flex flex-col items-center gap-1.5 px-3 py-3"
              >
                <div
                  className={`h-8 w-full rounded-md border ${
                    opt.value === "light"
                      ? "bg-white border-gray-200"
                      : opt.value === "dark"
                        ? "bg-gray-900 border-gray-700"
                        : "border-gray-300 dark:border-gray-600"
                  }`}
                  style={
                    opt.value === "transparent"
                      ? {
                          background:
                            "linear-gradient(135deg, rgba(255,255,255,0.4) 0%, rgba(200,200,255,0.2) 100%)",
                          backdropFilter: "blur(4px)",
                        }
                      : undefined
                  }
                />
                <div className="flex items-center gap-1.5">
                  <RadioDot active={active} size="md" />
                  <span className="text-[12px] text-gray-600 dark:text-gray-400">
                    {opt.label}
                  </span>
                </div>
              </SelectableCard>
            );
          })}
        </div>
      </SettingsCard>

      <SettingsCard
        title={t("appearanceSettings.popupLayout")}
        description={t("appearanceSettings.popupLayoutDescription")}
      >
        <div className="mt-1 grid grid-cols-2 gap-2.5">
          {layoutOptions.map((opt) => {
            const active = settings.popupLayout === opt.value;
            return (
              <SelectableCard
                key={opt.value}
                active={active}
                onClick={() => update("popupLayout", opt.value)}
                className="flex min-w-0 flex-col gap-2 p-2.5 text-left"
              >
                <LayoutPreview layout={opt.value} />
                <div className="flex min-w-0 items-start gap-2 px-0.5 pb-0.5">
                  <span className="mt-0.5">
                    <RadioDot active={active} size="md" />
                  </span>
                  <div className="min-w-0">
                    <div className="text-[12px] font-medium text-gray-700 dark:text-gray-200">
                      {opt.label}
                    </div>
                    <div className="mt-0.5 text-[10px] leading-3.5 text-gray-400 dark:text-gray-500">
                      {opt.description}
                    </div>
                  </div>
                </div>
              </SelectableCard>
            );
          })}
        </div>
      </SettingsCard>

      <SettingsCard
        title={t("appearanceSettings.uiSize")}
        description={t("appearanceSettings.uiSizeDescription")}
      >
        <div className="flex gap-2 mt-1">
          {([
            { value: "small" as const, label: t("appearanceSettings.uiSizeSmall"), fontSize: "13px" },
            { value: "default" as const, label: t("appearanceSettings.uiSizeDefault"), fontSize: "16px" },
            { value: "large" as const, label: t("appearanceSettings.uiSizeLarge"), fontSize: "19px" },
          ]).map((opt) => {
            const active = settings.uiSize === opt.value;
            return (
              <SelectableCard
                key={opt.value}
                active={active}
                onClick={() => update("uiSize", opt.value)}
                className="flex-1 flex flex-col items-center gap-1.5 px-2 py-2"
              >
                <div className="w-full h-[48px] rounded-md border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 flex items-center justify-center">
                  <span
                    className="font-medium text-gray-500 dark:text-gray-400 select-none"
                    style={{ fontSize: opt.fontSize }}
                  >
                    Aa
                  </span>
                </div>
                <div className="flex items-center gap-1">
                  <RadioDot active={active} size="sm" />
                  <span className="text-[11px] text-gray-600 dark:text-gray-400 whitespace-nowrap">
                    {opt.label}
                  </span>
                </div>
              </SelectableCard>
            );
          })}
        </div>
      </SettingsCard>

      <SettingsList>
        <SettingsRow
          label={t("appearanceSettings.roundedCorners")}
          description={t("appearanceSettings.roundedCornersDescription")}
        >
          <Toggle
            checked={settings.roundedPopupCorners}
            onChange={(v) => update("roundedPopupCorners", v)}
          />
        </SettingsRow>

        <SettingsRow
          label={t("appearanceSettings.reduceEffects")}
          description={t("appearanceSettings.reduceEffectsDescription")}
        >
          <Toggle
            checked={settings.reduceVisualEffects}
            onChange={(v) => update("reduceVisualEffects", v)}
          />
        </SettingsRow>
      </SettingsList>

      <SettingsCard
        title={t("appearanceSettings.accentColor")}
        description={t("appearanceSettings.accentColorDescription")}
      >
        <div className="flex gap-2 mt-1">
          {accentOptions.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => update("accentStyle", opt.value)}
              title={opt.value}
              className={`h-7 w-7 rounded-full transition-all
                focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-blue-400
                ${
                  settings.accentStyle === opt.value
                    ? "ring-2 ring-offset-2 ring-gray-400 dark:ring-gray-500 dark:ring-offset-gray-900 scale-110"
                    : "hover:scale-105"
                }`}
              style={{ backgroundColor: opt.color }}
            />
          ))}
        </div>
      </SettingsCard>

      <SettingsCard
        title={t("appearanceSettings.colorMode")}
        description={t("appearanceSettings.colorModeDescription")}
      >
        <div className="flex flex-col gap-1.5 mt-1">
          {([
            { value: "kimai" as const, label: t("appearanceSettings.colorModeKimai"), dots: 1 },
            { value: "activity" as const, label: t("appearanceSettings.colorModeActivity"), dots: 1 },
            { value: "project" as const, label: t("appearanceSettings.colorModeProject"), dots: 1 },
            { value: "customer" as const, label: t("appearanceSettings.colorModeCustomer"), dots: 1 },
            { value: "activity-project" as const, label: t("appearanceSettings.colorModeActivityProject"), dots: 2 },
            { value: "activity-customer" as const, label: t("appearanceSettings.colorModeActivityCustomer"), dots: 2 },
            { value: "project-customer" as const, label: t("appearanceSettings.colorModeProjectCustomer"), dots: 2 },
          ]).map((opt) => {
            const active = settings.colorMode === opt.value;
            return (
              <SelectableCard
                key={opt.value}
                active={active}
                onClick={() => update("colorMode", opt.value)}
                className="flex items-center gap-2.5 px-3 py-2 text-left"
              >
                <RadioDot active={active} size="md" />
                <span className="flex items-center gap-1.5 min-w-0">
                  <span className="inline-flex gap-0.5 shrink-0">
                    {Array.from({ length: opt.dots }, (_, i) => (
                      <span
                        key={i}
                        className="inline-block h-2 w-2 rounded-full"
                        style={{
                          backgroundColor: opt.dots === 1
                            ? "#10b981"
                            : i === 0 ? "#10b981" : "#3b82f6",
                        }}
                      />
                    ))}
                  </span>
                  <span className="text-[12px] text-gray-600 dark:text-gray-400 truncate">
                    {opt.label}
                  </span>
                </span>
              </SelectableCard>
            );
          })}
        </div>
      </SettingsCard>
    </SettingsPage>
  );
}
