import { useTranslation } from "react-i18next";
import { useEffect, useState } from "react";
import type { AppSettings } from "../types";
import { setTrayClickActions, setDisplayMode, listMonitors, setPopupMonitor, setTrayIconSize, setTrayIconShape } from "../api/trayApi";
import type { MonitorInfo } from "../api/trayApi";
import {
  Divider,
  FieldGroup,
  SectionDescription,
  SectionTitle,
  Select,
  Toggle,
} from "./Controls";

const isMac = navigator.platform.toUpperCase().includes("MAC");
const isLinux = navigator.platform.toUpperCase().includes("LINUX");

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
const GLYPH_RIM = "#0b7a5c"; // darker emerald rim, mirrors the tray rendering

// SVG preview mirroring the tray icon presets, so pickers show a live preview.
function ShapeGlyph({ shape, px }: { shape: AppSettings["trayIconShape"]; px: number }) {
  const common = { width: px, height: px };
  switch (shape) {
    case "ring":
      return (
        <svg {...common} viewBox="0 0 24 24" className="shrink-0">
          <circle cx="12" cy="12" r="9" fill="none" stroke={GLYPH_FILL} strokeWidth="4.5" />
        </svg>
      );
    case "square":
      return (
        <svg {...common} viewBox="0 0 24 24" className="shrink-0">
          <rect x="3" y="3" width="18" height="18" rx="6" fill={GLYPH_FILL} stroke={GLYPH_RIM} strokeWidth="1.5" />
        </svg>
      );
    case "clock":
      return (
        <svg {...common} viewBox="0 0 24 24" className="shrink-0" stroke={GLYPH_FILL} strokeWidth="2" strokeLinecap="round">
          <circle cx="12" cy="12" r="9" fill="none" />
          <line x1="12" y1="12" x2="17.2" y2="8.9" />
          <line x1="12" y1="12" x2="6.8" y2="8.9" />
        </svg>
      );
    default:
      return (
        <svg {...common} viewBox="0 0 24 24" className="shrink-0">
          <circle cx="12" cy="12" r="9" fill={GLYPH_FILL} stroke={GLYPH_RIM} strokeWidth="1.5" />
        </svg>
      );
  }
}

export default function TrayWindowSection({ settings, update }: Props) {
  const { t } = useTranslation();
  const [monitors, setMonitors] = useState<MonitorInfo[]>([]);

  useEffect(() => {
    if (isLinux) {
      listMonitors().then(setMonitors);
    }
  }, []);

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
    <div>
      <SectionTitle>{t("traySettings.title")}</SectionTitle>
      <SectionDescription>
        {t("traySettings.description")}
      </SectionDescription>

      <div className="text-[13px] font-medium text-gray-700 dark:text-gray-300 mb-1.5">
        {t("traySettings.iconShape")}
      </div>
      <div className="text-[11px] text-gray-400 dark:text-gray-500 mb-3">
        {t("traySettings.iconShapeDescription")}
      </div>
      <div className="grid grid-cols-4 gap-2 mb-2">
        {([
          { value: "dot" as const, label: t("traySettings.iconShapeDot") },
          { value: "ring" as const, label: t("traySettings.iconShapeRing") },
          { value: "square" as const, label: t("traySettings.iconShapeSquare") },
          { value: "clock" as const, label: t("traySettings.iconShapeClock") },
        ]).map((opt) => {
          const active = (settings.trayIconShape ?? "dot") === opt.value;
          return (
            <button
              key={opt.value}
              type="button"
              onClick={() => {
                update("trayIconShape", opt.value);
                setTrayIconShape(opt.value);
              }}
              className={`flex flex-col items-center gap-2 rounded-lg border px-2 py-3 transition-colors
                focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]
                ${
                  active
                    ? "border-[var(--accent)] bg-[var(--accent-light)]"
                    : "border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600"
                }`}
            >
              <div className="h-5 flex items-center justify-center">
                <ShapeGlyph shape={opt.value} px={18} />
              </div>
              <span className="text-[11px] text-gray-600 dark:text-gray-400">
                {opt.label}
              </span>
            </button>
          );
        })}
      </div>

      <Divider />

      <div className="text-[13px] font-medium text-gray-700 dark:text-gray-300 mb-1.5">
        {t("traySettings.iconSize")}
      </div>
      <div className="text-[11px] text-gray-400 dark:text-gray-500 mb-3">
        {t("traySettings.iconSizeDescription")}
      </div>
      <div className="grid grid-cols-4 gap-2 mb-2">
        {([
          { value: "small" as const, label: t("traySettings.iconSizeSmall"), px: 12 },
          { value: "medium" as const, label: t("traySettings.iconSizeMedium"), px: 16 },
          { value: "large" as const, label: t("traySettings.iconSizeLarge"), px: 21 },
          { value: "xlarge" as const, label: t("traySettings.iconSizeXLarge"), px: 26 },
        ]).map((opt) => {
          const active = (settings.trayIconSize ?? "medium") === opt.value;
          return (
            <button
              key={opt.value}
              type="button"
              onClick={() => {
                update("trayIconSize", opt.value);
                setTrayIconSize(opt.value);
              }}
              className={`flex flex-col items-center gap-2 rounded-lg border px-2 py-3 transition-colors
                focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]
                ${
                  active
                    ? "border-[var(--accent)] bg-[var(--accent-light)]"
                    : "border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600"
                }`}
            >
              <div className="h-7 flex items-center justify-center">
                <ShapeGlyph shape={settings.trayIconShape ?? "dot"} px={opt.px} />
              </div>
              <span className="text-[11px] text-gray-600 dark:text-gray-400">
                {opt.label}
              </span>
            </button>
          );
        })}
      </div>

      <Divider />

      <FieldGroup label={t("general.displayMode")} description={t("general.displayModeDescription")}>
        <div className="flex gap-2 mt-1">
          {([
            { value: "tray" as const, label: t("general.displayModeTray"), desc: t("general.displayModeTrayDescription") },
            { value: "detached" as const, label: t("general.displayModeDetached"), desc: t("general.displayModeDetachedDescription") },
          ]).map((opt) => {
            const active = settings.displayMode === opt.value;
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() => {
                  update("displayMode", opt.value);
                  setDisplayMode(opt.value);
                }}
                className={`flex-1 flex flex-col items-center gap-1.5 rounded-lg border px-3 py-3 transition-colors
                  focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]
                  ${
                    active
                      ? "border-[var(--accent)] bg-[var(--accent-light)]"
                      : "border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600"
                  }`}
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
                  <span
                    className={`inline-flex items-center justify-center h-3.5 w-3.5 rounded-full border shrink-0
                      ${
                        active
                          ? "border-[var(--accent)]"
                          : "border-gray-300 dark:border-gray-600"
                      }`}
                  >
                    {active && (
                      <span className="h-2 w-2 rounded-full bg-[var(--accent)]" />
                    )}
                  </span>
                  <span className="text-[12px] text-gray-600 dark:text-gray-400">
                    {opt.label}
                  </span>
                </div>
                <span className="text-[10px] text-gray-400 dark:text-gray-500 text-center leading-tight">
                  {opt.desc}
                </span>
              </button>
            );
          })}
        </div>
      </FieldGroup>

      {isMac && (
        <>
          <Divider />

          <FieldGroup
            label={t("traySettings.trueTray")}
            description={t("traySettings.trueTrayDescription")}
            horizontal
          >
            <Toggle
              checked={settings.trueTrayMode}
              onChange={(v) => update("trueTrayMode", v)}
            />
          </FieldGroup>
          <p className="-mt-1 text-[10px] text-amber-600 dark:text-amber-500/80">
            {t("traySettings.trueTrayRestartNote")}
          </p>
        </>
      )}

      {isLinux && (
        <>
          <Divider />

          <FieldGroup
            label={t("traySettings.popupMonitorMode")}
            description={t("traySettings.popupMonitorModeDescription")}
            horizontal
          >
            <Select
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
          </FieldGroup>

          {settings.popupMonitorMode === "specific" && (
            <>
              <Divider />
              <FieldGroup
                label={t("traySettings.popupMonitorIndex")}
                description={t("traySettings.popupMonitorIndexDescription")}
                horizontal
              >
                <Select
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
              </FieldGroup>

              <Divider />
              <FieldGroup
                label={t("traySettings.popupMonitorPosition")}
                description={t("traySettings.popupMonitorPositionDescription")}
                horizontal
              >
                <Select
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
              </FieldGroup>
            </>
          )}
        </>
      )}

      <Divider />

      <FieldGroup label={t("general.trayLeftClick")} description={isLinux ? t("traySettings.linuxOnly") : t("general.trayLeftClickDescription")} horizontal>
        <Select
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
          disabled={isLinux}
        />
      </FieldGroup>

      <Divider />

      <FieldGroup label={t("general.trayRightClick")} description={isLinux ? t("traySettings.linuxOnly") : t("general.trayRightClickDescription")} horizontal>
        <Select
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
          disabled={isLinux}
        />
      </FieldGroup>

      <Divider />

      <div className={!isMac ? "opacity-50 pointer-events-none" : ""}>
        <div className="text-[13px] font-medium text-gray-700 dark:text-gray-300 mb-1.5">
          {t("timerSettings.menuBarLabel")}
        </div>
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
              <button
                key={opt.value}
                type="button"
                disabled={!isMac}
                onClick={() => update("menuBarLabelStyle", opt.value)}
                className={`relative flex flex-col items-center gap-2 rounded-lg border px-3 py-3 transition-colors text-left
                  focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400
                  ${
                    active
                      ? "border-[var(--accent)] bg-[var(--accent-light)]"
                      : "border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600"
                  }`}
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
                  <span
                    className={`inline-flex items-center justify-center h-3.5 w-3.5 rounded-full border shrink-0
                      ${
                        active
                          ? "border-[var(--accent)]"
                          : "border-gray-300 dark:border-gray-600"
                      }`}
                  >
                    {active && (
                      <span className="h-2 w-2 rounded-full bg-[var(--accent)]" />
                    )}
                  </span>
                  <span className="text-[12px] text-gray-600 dark:text-gray-400">
                    {opt.label}
                  </span>
                </div>
              </button>
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
    </div>
  );
}
