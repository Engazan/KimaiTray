import { useTranslation } from "react-i18next";
import type { AppSettings } from "../types";
import { Select, Toggle } from "./Controls";
import PopupPreview from "./PopupPreview";
import { usePlatform } from "../platform";
import { usePrefersDark } from "./usePrefersDark";
import {
  CARD,
  RadioDot,
  SelectableCard,
  SettingsList,
  SettingsPage,
  SettingsRow,
  SettingsRowStacked,
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
  const wrap = "w-full h-[72px] rounded-md border border-[var(--s-line)] bg-white dark:bg-gray-900 p-1.5 flex flex-col";

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
          <svg className="h-[5px] w-[5px] text-[var(--s-fg-subtle)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
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
        <svg className="h-[5px] w-[5px] text-[var(--s-fg-subtle)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
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
  const { os } = usePlatform();
  const prefersDark = usePrefersDark();

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

  const sizes: Array<{ value: AppSettings["uiSize"]; label: string; tick: string }> = [
    { value: "small", label: `${t("appearanceSettings.uiSizeSmall")} · 85%`, tick: "85%" },
    { value: "default", label: `${t("appearanceSettings.uiSizeDefault")} · 100%`, tick: "100%" },
    { value: "large", label: `${t("appearanceSettings.uiSizeLarge")} · 115%`, tick: "115%" },
    { value: "scale130", label: "130%", tick: "130%" },
    { value: "scale145", label: "145%", tick: "145%" },
    { value: "scale160", label: "160%", tick: "160%" },
  ];
  const selectedSize = Math.max(0, sizes.findIndex((size) => size.value === settings.uiSize));

  return (
    <SettingsPage
      title={t("appearanceSettings.title")}
      description={t("appearanceSettings.description")}
    >
      <section data-settings-group>
        <h3 className="mb-2 px-1 text-[10.5px] font-semibold uppercase tracking-[0.08em] text-[var(--s-fg-subtle)]">
          {t("appearanceSettings.popupGroup")}
        </h3>
        <div className={`grid overflow-hidden sm:grid-cols-[240px_1fr] ${CARD}`}>
          <PopupPreview settings={settings} label={t("appearanceSettings.previewLabel")} os={os} prefersDark={prefersDark} />
          <div className="flex min-w-0 flex-col gap-3 border-t border-[var(--s-line-soft)] px-4 py-3.5 sm:border-l sm:border-t-0">
            <div data-settings-item data-settings-search={themeOptions.map((o) => o.label).join(" ")}>
              <div className="text-[13px] font-medium text-[var(--s-fg)]">{t("appearanceSettings.theme")}</div>
              <div className="mt-0.5 text-[11.5px] text-[var(--s-fg-subtle)]">{t("appearanceSettings.themeDescription")}</div>
              <div className="mt-2.5 flex flex-col gap-1.5">
                {themeOptions.map((opt) => {
                  const active = settings.theme === opt.value;
                  return (
                    <SelectableCard
                      key={opt.value}
                      active={active}
                      onClick={() => update("theme", opt.value)}
                      className="flex items-center gap-2.5 px-2.5 py-2 text-left"
                    >
                      <RadioDot active={active} />
                      <span className="flex min-w-0 flex-col">
                        <span className="text-[12.5px] font-medium text-[var(--s-fg)]">{opt.label}</span>
                        <span className="text-[11px] text-[var(--s-fg-subtle)]" aria-hidden="true">
                          {opt.value === "transparent" && os !== "macos"
                            ? t("appearanceSettings.transparentNoBlur")
                            : opt.description}
                        </span>
                      </span>
                    </SelectableCard>
                  );
                })}
              </div>
            </div>
            <SettingsRow
              inset
              label={t("appearanceSettings.roundedCorners")}
              description={t("appearanceSettings.roundedCornersDescription")}
            >
              <Toggle
                ariaLabel={t("appearanceSettings.roundedCorners")}
                checked={settings.roundedPopupCorners}
                onChange={(v) => update("roundedPopupCorners", v)}
              />
            </SettingsRow>
            <SettingsRow
              inset
              label={t("appearanceSettings.reduceEffects")}
              description={t("appearanceSettings.reduceEffectsDescription")}
            >
              <Toggle
                ariaLabel={t("appearanceSettings.reduceEffects")}
                checked={settings.reduceVisualEffects}
                onChange={(v) => update("reduceVisualEffects", v)}
              />
            </SettingsRow>
          </div>
        </div>
      </section>

      <section data-settings-group>
        <div className="mb-2 px-1">
          <h3 className="text-[10.5px] font-semibold uppercase tracking-[0.08em] text-[var(--s-fg-subtle)]">
            {t("appearanceSettings.popupLayout")}
          </h3>
          <p className="mt-0.5 text-[11.5px] text-[var(--s-fg-subtle)]">{t("appearanceSettings.popupLayoutDescription")}</p>
        </div>
        <div
          data-settings-item
          data-settings-search={`${t("appearanceSettings.popupLayout")} ${layoutOptions.map((o) => o.label).join(" ")}`}
          className="grid grid-cols-2 gap-2 md:grid-cols-4"
        >
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
                <div className="flex min-w-0 items-center gap-[7px]">
                  <RadioDot active={active} />
                  <span className="text-[12.5px] font-medium text-[var(--s-fg)]">{opt.label}</span>
                </div>
                <span className="text-[11px] leading-[1.4] text-[var(--s-fg-subtle)]">{opt.description}</span>
              </SelectableCard>
            );
          })}
        </div>
      </section>

      <SettingsList title={t("appearanceSettings.colorsGroup")}>
        <SettingsRow
          label={t("appearanceSettings.accentColor")}
          description={t("appearanceSettings.accentColorDescription")}
        >
          <div className="flex gap-[9px]" role="group" aria-label={t("appearanceSettings.accentColor")}>
            {accentOptions.map((opt) => {
              const active = settings.accentStyle === opt.value;
              return (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => update("accentStyle", opt.value)}
                  title={opt.value}
                  aria-pressed={active}
                  className={`h-[26px] w-[26px] rounded-full transition-transform
                    focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-[var(--accent)]
                    ${active
                      ? "ring-2 ring-[var(--s-fg)] ring-offset-2 ring-offset-[var(--s-card)]"
                      : "hover:scale-110"}`}
                  style={{ backgroundColor: opt.color }}
                />
              );
            })}
          </div>
        </SettingsRow>

        <SettingsRow
          label={t("appearanceSettings.colorMode")}
          description={t("appearanceSettings.colorModeDescription")}
        >
          <Select
            ariaLabel={t("appearanceSettings.colorMode")}
            value={settings.colorMode}
            onChange={(v) => update("colorMode", v as AppSettings["colorMode"])}
            options={[
              { value: "kimai", label: t("appearanceSettings.colorModeKimai") },
              { value: "activity", label: t("appearanceSettings.colorModeActivity") },
              { value: "project", label: t("appearanceSettings.colorModeProject") },
              { value: "customer", label: t("appearanceSettings.colorModeCustomer") },
              { value: "activity-project", label: t("appearanceSettings.colorModeActivityProject") },
              { value: "activity-customer", label: t("appearanceSettings.colorModeActivityCustomer") },
              { value: "project-customer", label: t("appearanceSettings.colorModeProjectCustomer") },
            ]}
          />
        </SettingsRow>

        <SettingsRowStacked
          label={t("appearanceSettings.uiSize")}
          description={
            <>
              {t("appearanceSettings.uiSizeDescription")} ·{" "}
              <b className="font-medium text-[var(--s-fg)]">{sizes[selectedSize].label}</b>
            </>
          }
        >
          <input
            type="range"
            min={0}
            max={sizes.length - 1}
            step={1}
            value={selectedSize}
            aria-label={t("appearanceSettings.uiSize")}
            aria-valuetext={sizes[selectedSize].label}
            onChange={(event) => update("uiSize", sizes[Number(event.target.value)].value)}
            className="w-full cursor-pointer accent-[var(--accent)]"
          />
          <div className="mt-0.5 flex justify-between font-mono text-[10.5px] text-[var(--s-fg-subtle)]">
            {sizes.map((size, i) => (
              <span key={size.value} className={i === selectedSize ? "font-semibold text-[var(--accent)]" : ""}>
                {size.tick}
              </span>
            ))}
          </div>
        </SettingsRowStacked>
      </SettingsList>
    </SettingsPage>
  );
}
