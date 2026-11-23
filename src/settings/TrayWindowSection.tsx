import { useTranslation } from "react-i18next";
import { useEffect, useState, type CSSProperties } from "react";
import type { AppSettings, TrayStateColors } from "../types";
import { setTrayClickActions, setDisplayMode, listMonitors, setPopupMonitor, setTrayIconSize, setTrayIconShape, setTrayColors } from "../api/trayApi";
import type { MonitorInfo } from "../api/trayApi";
import { defaultTrayColors } from "./service";
import ColorPicker from "./ColorPicker";
import TrayBarPreview, { ShapeGlyph } from "./TrayBarPreview";
import { usePrefersDark } from "./usePrefersDark";
import { Segmented, Select, Toggle, buttonClass } from "./Controls";
import { usePlatform } from "../platform";
import {
  Badge,
  RadioDot,
  SelectableCard,
  SettingsCard,
  SettingsList,
  SettingsPage,
  SettingsRow,
  SettingsRowStacked,
  SettingsWarning,
} from "./SettingsLayout";

interface Props {
  settings: AppSettings;
  update: <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => void;
}


export default function TrayWindowSection({ settings, update }: Props) {
  const { t } = useTranslation();
  const platform = usePlatform();
  const isMac = platform.os === "macos";
  const isLinux = platform.os === "linux";
  const [monitors, setMonitors] = useState<MonitorInfo[]>([]);
  const prefersDark = usePrefersDark();
  const [previewState, setPreviewState] = useState<keyof TrayStateColors>("running");

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

  const menuBarOptions: { value: AppSettings["menuBarLabelStyle"]; label: string }[] = [
    { value: "timer", label: t("timerSettings.elapsedTime") },
    { value: "project", label: t("timerSettings.projectName") },
    { value: "activity", label: t("timerSettings.activityName") },
    { value: "hidden", label: t("timerSettings.iconOnly") },
  ];
  const previewLabel = {
    timer: settings.showSecondsInTimer ? "1:23:45" : "1:23",
    project: "Acme Corp",
    activity: "Development",
    hidden: "",
  }[settings.menuBarLabelStyle];
  const shape = settings.trayIconShape ?? "dot";
  const iconPx = { small: 12, medium: 15, large: 18, xlarge: 21 }[settings.trayIconSize ?? "medium"];

  const positions: { value: AppSettings["popupMonitorPosition"]; label: string; style: CSSProperties }[] = [
    { value: "top-left", label: t("traySettings.popupMonitorPositionTopLeft"), style: { top: 8, left: 8 } },
    { value: "top-right", label: t("traySettings.popupMonitorPositionTopRight"), style: { top: 8, right: 8 } },
    { value: "center", label: t("traySettings.popupMonitorPositionCenter"), style: { top: "50%", left: "50%", transform: "translate(-50%, -50%)" } },
    { value: "bottom-left", label: t("traySettings.popupMonitorPositionBottomLeft"), style: { bottom: 8, left: 8 } },
    { value: "bottom-right", label: t("traySettings.popupMonitorPositionBottomRight"), style: { bottom: 8, right: 8 } },
  ];
  const positionLabel = positions.find((pos) => pos.value === settings.popupMonitorPosition)?.label;

  return (
    <SettingsPage title={t("traySettings.title")} description={t("traySettings.description")}>
      <SettingsCard title={t("traySettings.previewTitle")} className="flex flex-col gap-3">
        <TrayBarPreview
          os={platform.os}
          dark={prefersDark}
          ariaLabel={t("traySettings.previewTitle")}
          icon={<ShapeGlyph shape={shape} px={iconPx} color={trayColors[previewState]} />}
          label={isMac && previewState !== "idle" ? previewLabel : ""}
        />
        <div className="flex flex-wrap gap-1.5">
          {trayColorOptions.map((opt) => {
            const on = previewState === opt.state;
            return (
              <button
                key={opt.state}
                type="button"
                aria-pressed={on}
                aria-label={`${t("traySettings.previewTitle")}: ${opt.label}`}
                onClick={() => setPreviewState(opt.state)}
                className={`inline-flex items-center gap-1.5 rounded-full border py-[3px] pl-2 pr-2.5 text-[11.5px] transition-colors
                  focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] ${
                    on
                      ? "border-[var(--accent)] bg-[var(--accent-soft)] font-medium text-[var(--accent)]"
                      : "border-[var(--s-line)] bg-[var(--s-card)] text-[var(--s-fg-muted)] hover:text-[var(--s-fg)]"
                  }`}
              >
                <i className="block h-2 w-2 rounded-full" style={{ background: trayColors[opt.state] }} />
                {opt.label}
              </button>
            );
          })}
        </div>
      </SettingsCard>

      <SettingsList title={t("traySettings.iconGroup")} allowOverflow>
        <SettingsRowStacked label={t("traySettings.iconShape")} description={t("traySettings.iconShapeDescription")}>
          <Segmented
            ariaLabel={t("traySettings.iconShape")}
            value={shape}
            onChange={(v) => {
              update("trayIconShape", v);
              setTrayIconShape(v);
            }}
            options={([
              { value: "dot" as const, label: t("traySettings.iconShapeDot") },
              { value: "ring" as const, label: t("traySettings.iconShapeRing") },
              { value: "square" as const, label: t("traySettings.iconShapeSquare") },
              { value: "clock" as const, label: t("traySettings.iconShapeClock") },
            ]).map((opt) => ({
              value: opt.value,
              ariaLabel: opt.label,
              label: (
                <>
                  <ShapeGlyph shape={opt.value} px={12} />
                  {opt.label}
                </>
              ),
            }))}
          />
        </SettingsRowStacked>

        <SettingsRowStacked label={t("traySettings.iconSize")} description={t("traySettings.iconSizeDescription")}>
          <Segmented
            ariaLabel={t("traySettings.iconSize")}
            value={settings.trayIconSize ?? "medium"}
            onChange={(v) => {
              update("trayIconSize", v);
              setTrayIconSize(v);
            }}
            options={[
              { value: "small", label: t("traySettings.iconSizeSmall") },
              { value: "medium", label: t("traySettings.iconSizeMedium") },
              { value: "large", label: t("traySettings.iconSizeLarge") },
              { value: "xlarge", label: t("traySettings.iconSizeXLarge") },
            ]}
          />
        </SettingsRowStacked>

        <div data-settings-item className="px-4 py-3">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <div className="text-[13px] font-medium text-[var(--s-fg)]">{t("traySettings.iconColors")}</div>
              <div className="mt-0.5 text-[11.5px] leading-[1.45] text-[var(--s-fg-subtle)]">
                {t("traySettings.iconColorsDescription")}
              </div>
            </div>
            <button type="button" onClick={resetTrayColors} className={buttonClass("ghost", "sm")}>
              {t("traySettings.resetColors")}
            </button>
          </div>
          <div className="mt-2.5 grid grid-cols-2 gap-2 md:grid-cols-4">
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
                  <div className="flex items-center gap-2 px-2.5 py-[7px]">
                    <span
                      className="h-6 w-6 shrink-0 rounded-md border border-black/10 dark:border-white/10"
                      style={{ backgroundColor: value }}
                    />
                    <span className="min-w-0 text-left">
                      <span className="block text-[11.5px] font-medium text-[var(--s-fg)]">{opt.label}</span>
                      <code className="block font-mono text-[10px] text-[var(--s-fg-subtle)]">{value}</code>
                    </span>
                  </div>
                </ColorPicker>
              );
            })}
          </div>
        </div>
      </SettingsList>

      <SettingsList>
        <SettingsRowStacked
          label={t("timerSettings.menuBarLabel")}
          description={isMac ? t("timerSettings.menuBarLabelDescription") : t("traySettings.macOnly")}
          badge={<Badge>macOS</Badge>}
          dimmed={!isMac}
        >
          <Segmented
            ariaLabel={t("timerSettings.menuBarLabel")}
            disabled={!isMac}
            value={settings.menuBarLabelStyle}
            onChange={(v) => update("menuBarLabelStyle", v)}
            options={menuBarOptions}
          />
        </SettingsRowStacked>
        {settings.menuBarLabelStyle === "timer" && isMac && (
          <SettingsRow label={t("timerSettings.showSeconds")} description={t("timerSettings.showSecondsDescription")}>
            <Toggle
              ariaLabel={t("timerSettings.showSeconds")}
              checked={settings.showSecondsInTimer}
              onChange={(v) => update("showSecondsInTimer", v)}
            />
          </SettingsRow>
        )}
      </SettingsList>

      <SettingsList title={t("traySettings.behaviorGroup")}>
        <SettingsRowStacked label={t("general.displayMode")} description={t("general.displayModeDescription")}>
          <div className="grid grid-cols-2 gap-2">
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
                  className="flex flex-col gap-1 p-2.5 text-left"
                >
                  <span className="flex items-center gap-[7px] text-[12.5px] font-medium text-[var(--s-fg)]">
                    <RadioDot active={active} />
                    {opt.label}
                  </span>
                  <span className="text-[11px] leading-[1.4] text-[var(--s-fg-subtle)]">{opt.desc}</span>
                </SelectableCard>
              );
            })}
          </div>
        </SettingsRowStacked>

        <SettingsRow label={t("general.trayLeftClick")} description={t("general.trayLeftClickDescription")}>
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

        <SettingsRow label={t("general.trayRightClick")} description={t("general.trayRightClickDescription")}>
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

        {isMac && (
          <SettingsRow
            label={t("traySettings.trueTray")}
            badge={<Badge>macOS</Badge>}
            description={
              <>
                {t("traySettings.trueTrayDescription")}{" "}
                <span className="text-amber-600 dark:text-amber-400">{t("traySettings.trueTrayRestartNote")}</span>
              </>
            }
          >
            <Toggle
              ariaLabel={t("traySettings.trueTray")}
              checked={settings.trueTrayMode}
              onChange={(v) => update("trueTrayMode", v)}
            />
          </SettingsRow>
        )}
      </SettingsList>

      {isLinux && (
        <SettingsList title={t("traySettings.placementGroup")}>
          {!platform.supportsWindowPositioning && (
            <div className="px-4 py-3">
              <SettingsWarning>{t("traySettings.waylandPositioningUnavailable")}</SettingsWarning>
            </div>
          )}
          <SettingsRow
            label={t("traySettings.popupMonitorMode")}
            description={t("traySettings.popupMonitorModeDescription")}
            dimmed={!platform.supportsWindowPositioning}
          >
            <Segmented
              ariaLabel={t("traySettings.popupMonitorMode")}
              disabled={!platform.supportsWindowPositioning}
              value={settings.popupMonitorMode}
              onChange={(val) => {
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
                label={t("traySettings.popupMonitorIndex")}
                description={t("traySettings.popupMonitorIndexDescription")}
                dimmed={!platform.supportsWindowPositioning}
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

              <SettingsRowStacked
                label={t("traySettings.popupMonitorPosition")}
                description={
                  <>
                    {t("traySettings.popupMonitorPositionDescription")}{" "}
                    <b className="font-medium text-[var(--s-fg)]">{positionLabel}</b>
                  </>
                }
                dimmed={!platform.supportsWindowPositioning}
              >
                <div className="pb-3">
                  <div
                    role="group"
                    aria-label={t("traySettings.popupMonitorPosition")}
                    className="relative aspect-[16/10] w-[200px] max-w-full rounded-lg border-2 border-gray-400/40 bg-[var(--s-hover)]
                      after:absolute after:-bottom-3 after:left-1/2 after:h-2 after:w-10 after:-translate-x-1/2 after:rounded-b after:bg-gray-400/40"
                  >
                    {positions.map((pos) => {
                      const on = settings.popupMonitorPosition === pos.value;
                      return (
                        <button
                          key={pos.value}
                          type="button"
                          aria-pressed={on}
                          aria-label={pos.label}
                          title={pos.label}
                          disabled={!platform.supportsWindowPositioning}
                          onClick={() => {
                            update("popupMonitorPosition", pos.value);
                            setPopupMonitor("specific", settings.popupMonitorIndex, pos.value);
                          }}
                          style={pos.style}
                          className={`absolute h-7 w-11 rounded-[5px] border-[1.5px] transition-colors
                            focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]
                            disabled:cursor-not-allowed disabled:opacity-35 ${
                              on
                                ? "border-[var(--accent)] bg-[var(--accent)] shadow-[0_2px_8px_var(--accent-line)]"
                                : "border-dashed border-gray-400/60 hover:border-[var(--accent)]"
                            }`}
                        />
                      );
                    })}
                  </div>
                </div>
              </SettingsRowStacked>
            </>
          )}
        </SettingsList>
      )}
    </SettingsPage>
  );
}
