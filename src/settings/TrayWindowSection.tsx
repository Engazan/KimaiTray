import { useTranslation } from "react-i18next";
import { useEffect, useState } from "react";
import type { AppSettings, TrayStateColors } from "../types";
import { setTrayClickActions, setDisplayMode, listMonitors, setPopupMonitor, setTrayIconSize, setTrayIconShape, setTrayColors } from "../api/trayApi";
import type { MonitorInfo } from "../api/trayApi";
import { defaultTrayColors } from "./service";
import ColorPicker from "./ColorPicker";
import { Select, Toggle } from "./Controls";
import { usePlatform } from "../platform";
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

function TrayDot() {
  return (
    <span
      className="inline-block h-[8px] w-[8px] rounded-full bg-emerald-500 shrink-0"
      style={{ boxShadow: "0 0 4px rgba(16,185,129,0.4)" }}
    />
  );
}

const GLYPH_FILL = "#10b981"; // emerald-500

// Darken a #RRGGBB hex color by `factor`, mirroring the tray rim shade (0.62).
function darken(hex: string, factor: number): string {
  const n = parseInt(hex.replace("#", ""), 16);
  if (Number.isNaN(n)) return hex;
  const r = Math.round(((n >> 16) & 0xff) * factor);
  const g = Math.round(((n >> 8) & 0xff) * factor);
  const b = Math.round((n & 0xff) * factor);
  return `#${((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1)}`;
}

// SVG preview mirroring the tray icon presets, so pickers show a live preview.
function ShapeGlyph({ shape, px, color = GLYPH_FILL }: { shape: AppSettings["trayIconShape"]; px: number; color?: string }) {
  const common = { width: px, height: px };
  const rim = darken(color, 0.62);
  switch (shape) {
    case "ring":
      return (
        <svg {...common} viewBox="0 0 24 24" className="shrink-0">
          <circle cx="12" cy="12" r="9" fill="none" stroke={color} strokeWidth="4.5" />
        </svg>
      );
    case "square":
      return (
        <svg {...common} viewBox="0 0 24 24" className="shrink-0">
          <rect x="3" y="3" width="18" height="18" rx="6" fill={color} stroke={rim} strokeWidth="1.5" />
        </svg>
      );
    case "clock":
      return (
        <svg {...common} viewBox="0 0 24 24" className="shrink-0" stroke={color} strokeWidth="2" strokeLinecap="round">
          <circle cx="12" cy="12" r="9" fill="none" />
          <line x1="12" y1="12" x2="17.2" y2="8.9" />
          <line x1="12" y1="12" x2="6.8" y2="8.9" />
        </svg>
      );
    default:
      return (
        <svg {...common} viewBox="0 0 24 24" className="shrink-0">
          <circle cx="12" cy="12" r="9" fill={color} stroke={rim} strokeWidth="1.5" />
        </svg>
      );
  }
}

export default function TrayWindowSection({ settings, update }: Props) {
  const { t } = useTranslation();
  const platform = usePlatform();
  const isMac = platform.os === "macos";
  const isLinux = platform.os === "linux";
  const [monitors, setMonitors] = useState<MonitorInfo[]>([]);

  useEffect(() => {
    if (isLinux) {
      listMonitors().then(setMonitors);
    }
  }, [isLinux]);

  const trayColors: TrayStateColors = { ...defaultTrayColors, ...(settings.trayColors ?? {}) };

  const updateTrayColor = (state: keyof TrayStateColors, value: string) => {
    const next = { ...trayColors, [state]: value };
    update("trayColors", next);
    setTrayColors(next);
  };

  const resetTrayColors = () => {
    const next = { ...defaultTrayColors };
    update("trayColors", next);
    setTrayColors(next);
  };

  const trayColorOptions: { state: keyof TrayStateColors; label: string }[] = [
    { state: "running", label: t("traySettings.stateRunning") },
    { state: "paused", label: t("traySettings.statePaused") },
    { state: "idle", label: t("traySettings.stateIdle") },
    { state: "error", label: t("traySettings.stateError") },
  ];

  const menuBarOptions: {
    value: AppSettings["menuBarLabelStyle"];
    label: string;
    previewWithSeconds: string;
    previewWithoutSeconds: string;
  }[] = [
    { value: "timer", label: t("timerSettings.elapsedTime"), previewWithSeconds: "1:23:45", previewWithoutSeconds: "1:23" },
    { value: "project", label: t("timerSettings.projectName"), previewWithSeconds: "Acme Corp", previewWithoutSeconds: "Acme Corp" },
    { value: "activity", label: t("timerSettings.activityName"), previewWithSeconds: "Development", previewWithoutSeconds: "Development" },
    { value: "hidden", label: t("timerSettings.iconOnly"), previewWithSeconds: "", previewWithoutSeconds: "" },
  ];

  return (
    <SettingsPage title={t("traySettings.title")} description={t("traySettings.description")}>
      <SettingsCard title={t("traySettings.iconShape")} description={t("traySettings.iconShapeDescription")}>
        <div className="grid grid-cols-4 gap-2">
          {([
            { value: "dot" as const, label: t("traySettings.iconShapeDot") },
            { value: "ring" as const, label: t("traySettings.iconShapeRing") },
            { value: "square" as const, label: t("traySettings.iconShapeSquare") },
            { value: "clock" as const, label: t("traySettings.iconShapeClock") },
          ]).map((opt) => {
            const active = (settings.trayIconShape ?? "dot") === opt.value;
            return (
              <SelectableCard
                key={opt.value}
                active={active}
                onClick={() => {
                  update("trayIconShape", opt.value);
                  setTrayIconShape(opt.value);
                }}
                className="flex flex-col items-center gap-2 px-2 py-3"
              >
                <div className="h-5 flex items-center justify-center">
                  <ShapeGlyph shape={opt.value} px={18} />
                </div>
                <span className="text-[11px] text-gray-600 dark:text-gray-400">
                  {opt.label}
                </span>
              </SelectableCard>
            );
          })}
        </div>
      </SettingsCard>

      <SettingsCard title={t("traySettings.iconSize")} description={t("traySettings.iconSizeDescription")}>
        <div className="grid grid-cols-4 gap-2">
          {([
            { value: "small" as const, label: t("traySettings.iconSizeSmall"), px: 12 },
            { value: "medium" as const, label: t("traySettings.iconSizeMedium"), px: 16 },
            { value: "large" as const, label: t("traySettings.iconSizeLarge"), px: 21 },
            { value: "xlarge" as const, label: t("traySettings.iconSizeXLarge"), px: 26 },
          ]).map((opt) => {
            const active = (settings.trayIconSize ?? "medium") === opt.value;
            return (
              <SelectableCard
                key={opt.value}
                active={active}
                onClick={() => {
                  update("trayIconSize", opt.value);
                  setTrayIconSize(opt.value);
                }}
                className="flex flex-col items-center gap-2 px-2 py-3"
              >
                <div className="h-7 flex items-center justify-center">
                  <ShapeGlyph shape={settings.trayIconShape ?? "dot"} px={opt.px} />
                </div>
                <span className="text-[11px] text-gray-600 dark:text-gray-400">
                  {opt.label}
                </span>
              </SelectableCard>
            );
          })}
        </div>
      </SettingsCard>

      <SettingsCard title={t("traySettings.iconColors")} description={t("traySettings.iconColorsDescription")}>
        <div className="grid grid-cols-4 gap-2">
          {trayColorOptions.map((opt, i) => {
            const value = trayColors[opt.state];
            return (
              <ColorPicker
                key={opt.state}
                value={value}
                onChange={(hex) => updateTrayColor(opt.state, hex)}
                align={i === 0 ? "start" : i === trayColorOptions.length - 1 ? "end" : "center"}
                ariaLabel={opt.label}
              >
                <div className="flex flex-col items-center gap-2 px-2 py-3">
                  <div className="h-7 flex items-center justify-center">
                    <ShapeGlyph shape={settings.trayIconShape ?? "dot"} px={22} color={value} />
                  </div>
                  <span className="flex items-center gap-1.5 text-[11px] text-gray-600 dark:text-gray-400">
                    <span
                      className="inline-block h-2.5 w-2.5 rounded-full border border-black/10 dark:border-white/10"
                      style={{ backgroundColor: value }}
                    />
                    {opt.label}
                  </span>
                </div>
              </ColorPicker>
            );
          })}
        </div>
        <div className="mt-3 flex justify-end">
          <button
            type="button"
            onClick={resetTrayColors}
            className="text-[11px] text-gray-400 transition-colors hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300"
          >
            {t("traySettings.resetColors")}
          </button>
        </div>
      </SettingsCard>

      <SettingsCard title={t("general.displayMode")} description={t("general.displayModeDescription")}>
        <div className="flex gap-2">
          {([
            { value: "tray" as const, label: t("general.displayModeTray"), desc: t("general.displayModeTrayDescription") },
            { value: "detached" as const, label: t("general.displayModeDetached"), desc: t("general.displayModeDetachedDescription") },
          ]).map((opt) => {
            const active = settings.displayMode === opt.value;
            return (
              <SelectableCard
                key={opt.value}
                active={active}
                onClick={() => {
                  update("displayMode", opt.value);
                  setDisplayMode(opt.value);
                }}
                className="flex-1 flex flex-col items-center gap-1.5 px-3 py-3"
              >
                <div className={`h-10 w-full rounded-md border flex items-center justify-center ${
                  active
                    ? "border-[var(--accent)]/30 bg-[var(--accent)]/5"
                    : "border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900"
                }`}>
                  {opt.value === "tray" ? (
                    <svg className="h-5 w-5 text-gray-400 dark:text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M3 4h18v2H3zM7 10h10v8a2 2 0 01-2 2H9a2 2 0 01-2-2v-8z" />
                    </svg>
                  ) : (
                    <svg className="h-5 w-5 text-gray-400 dark:text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M3 8a2 2 0 012-2h14a2 2 0 012 2v10a2 2 0 01-2 2H5a2 2 0 01-2-2V8z" />
                      <path strokeLinecap="round" strokeLinejoin="round" d="M3 8h18" />
                      <circle cx="5.5" cy="7" r="0.5" fill="currentColor" />
                      <circle cx="7.5" cy="7" r="0.5" fill="currentColor" />
                    </svg>
                  )}
                </div>
                <div className="flex items-center gap-1.5">
                  <RadioDot active={active} size="md" />
                  <span className="text-[12px] text-gray-600 dark:text-gray-400">
                    {opt.label}
                  </span>
                </div>
                <span className="text-[10px] text-gray-400 dark:text-gray-500 text-center leading-tight">
                  {opt.desc}
                </span>
              </SelectableCard>
            );
          })}
        </div>

        {isMac && (
          <div className="mt-4">
            <SettingsRow
              inset
              label={t("traySettings.trueTray")}
              description={
                <>
                  {t("traySettings.trueTrayDescription")}
                  <p className="mt-1 text-[10px] text-amber-600 dark:text-amber-500/80">
                    {t("traySettings.trueTrayRestartNote")}
                  </p>
                </>
              }
            >
              <Toggle
                checked={settings.trueTrayMode}
                onChange={(v) => update("trueTrayMode", v)}
              />
            </SettingsRow>
          </div>
        )}

        {isLinux && (
          <div className="mt-4 space-y-4">
            {!platform.supportsWindowPositioning && (
              <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] text-amber-700 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-400">
                {t("traySettings.waylandPositioningUnavailable")}
              </div>
            )}
            <SettingsRow
              inset
              label={t("traySettings.popupMonitorMode")}
              description={t("traySettings.popupMonitorModeDescription")}
            >
              <Select
                disabled={!platform.supportsWindowPositioning}
                value={settings.popupMonitorMode}
                onChange={(v) => {
                  const val = v as AppSettings["popupMonitorMode"];
                  update("popupMonitorMode", val);
                  setPopupMonitor(val, settings.popupMonitorIndex, settings.popupMonitorPosition);
                }}
                options={[
                  { value: "active", label: t("traySettings.popupMonitorModeActive") },
                  { value: "specific", label: t("traySettings.popupMonitorModeSpecific") },
                ]}
              />
            </SettingsRow>

            {settings.popupMonitorMode === "specific" && (
              <>
                <SettingsRow
                  inset
                  label={t("traySettings.popupMonitorIndex")}
                  description={t("traySettings.popupMonitorIndexDescription")}
                >
                  <Select
                    disabled={!platform.supportsWindowPositioning}
                    value={settings.popupMonitorIndex}
                    onChange={(v) => {
                      const val = Number(v);
                      update("popupMonitorIndex", val);
                      setPopupMonitor("specific", val, settings.popupMonitorPosition);
                    }}
                    options={
                      monitors.length > 0
                        ? monitors.map((m) => ({
                            value: m.index,
                            label: m.primary ? `${m.name} (primary)` : m.name,
                          }))
                        : [{ value: 0, label: "Monitor 1" }]
                    }
                  />
                </SettingsRow>

                <SettingsRow
                  inset
                  label={t("traySettings.popupMonitorPosition")}
                  description={t("traySettings.popupMonitorPositionDescription")}
                >
                  <Select
                    disabled={!platform.supportsWindowPositioning}
                    value={settings.popupMonitorPosition}
                    onChange={(v) => {
                      const val = v as AppSettings["popupMonitorPosition"];
                      update("popupMonitorPosition", val);
                      setPopupMonitor("specific", settings.popupMonitorIndex, val);
                    }}
                    options={[
                      { value: "bottom-right", label: t("traySettings.popupMonitorPositionBottomRight") },
                      { value: "bottom-left",  label: t("traySettings.popupMonitorPositionBottomLeft") },
                      { value: "top-right",    label: t("traySettings.popupMonitorPositionTopRight") },
                      { value: "top-left",     label: t("traySettings.popupMonitorPositionTopLeft") },
                      { value: "center",       label: t("traySettings.popupMonitorPositionCenter") },
                    ]}
                  />
                </SettingsRow>
              </>
            )}
          </div>
        )}
      </SettingsCard>

      <SettingsList>
        <SettingsRow
          label={t("general.trayLeftClick")}
          description={t("general.trayLeftClickDescription")}
        >
          <Select
            disabled={!platform.supportsTrayClickActions}
            value={settings.trayLeftClickAction}
            onChange={(v) => {
              const val = v as AppSettings["trayLeftClickAction"];
              update("trayLeftClickAction", val);
              setTrayClickActions(val, settings.trayRightClickAction);
            }}
            options={[
              { value: "popup", label: t("general.trayActionTogglePopup") },
              { value: "nothing", label: t("general.trayActionDoNothing") },
            ]}
          />
        </SettingsRow>

        <SettingsRow
          label={t("general.trayRightClick")}
          description={t("general.trayRightClickDescription")}
        >
          <Select
            disabled={!platform.supportsTrayClickActions}
            value={settings.trayRightClickAction}
            onChange={(v) => {
              const val = v as AppSettings["trayRightClickAction"];
              update("trayRightClickAction", val);
              setTrayClickActions(settings.trayLeftClickAction, val);
            }}
            options={[
              { value: "menu", label: t("general.trayActionShowMenu") },
              { value: "popup", label: t("general.trayActionTogglePopup") },
            ]}
          />
        </SettingsRow>
      </SettingsList>

      <SettingsCard title={t("timerSettings.menuBarLabel")}>
        <div className={!isMac ? "opacity-50 pointer-events-none" : ""}>
          <div className="text-[11px] text-gray-400 dark:text-gray-500 mb-3">
            {isMac
              ? t("timerSettings.menuBarLabelDescription")
              : t("traySettings.macOnly")}
          </div>

          <div className="grid grid-cols-2 gap-2">
            {menuBarOptions.map((opt) => {
              const active = settings.menuBarLabelStyle === opt.value;
              const preview = settings.showSecondsInTimer
                ? opt.previewWithSeconds
                : opt.previewWithoutSeconds;
              return (
                <SelectableCard
                  key={opt.value}
                  active={active}
                  disabled={!isMac}
                  onClick={() => update("menuBarLabelStyle", opt.value)}
                  className="relative flex flex-col items-center gap-2 px-3 py-3 text-left"
                >
                  <div className="flex items-center gap-1.5 h-5">
                    <TrayDot />
                    {preview && (
                      <span className="text-[11px] font-medium text-gray-700 dark:text-gray-300 truncate max-w-[80px]">
                        {preview}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-1.5 w-full">
                    <RadioDot active={active} size="md" />
                    <span className="text-[12px] text-gray-600 dark:text-gray-400">
                      {opt.label}
                    </span>
                  </div>
                </SelectableCard>
              );
            })}
          </div>

          {settings.menuBarLabelStyle === "timer" && isMac && (
            <div className="mt-3 flex items-center justify-between rounded-lg border border-gray-200 dark:border-gray-700 px-3 py-2.5">
              <div>
                <div className="text-[12px] font-medium text-gray-700 dark:text-gray-300">
                  {t("timerSettings.showSeconds")}
                </div>
                <div className="text-[11px] text-gray-400 dark:text-gray-500">
                  {t("timerSettings.showSecondsDescription")}
                </div>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={settings.showSecondsInTimer}
                onClick={() => update("showSecondsInTimer", !settings.showSecondsInTimer)}
                className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors
                  focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 focus-visible:ring-offset-1
                  ${settings.showSecondsInTimer ? "bg-[var(--accent)]" : "bg-gray-200 dark:bg-gray-700"}`}
              >
                <span
                  className={`inline-block h-3.5 w-3.5 rounded-full bg-white shadow-sm transition-transform
                    ${settings.showSecondsInTimer ? "translate-x-[18px]" : "translate-x-[3px]"}`}
                />
              </button>
            </div>
          )}
        </div>
      </SettingsCard>
    </SettingsPage>
  );
}
