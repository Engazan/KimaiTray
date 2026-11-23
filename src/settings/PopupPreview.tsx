import type { CSSProperties, ReactNode } from "react";
import type { AppSettings } from "../types";

/**
 * A miniature, non-interactive rendering of the tray popup that reacts to the
 * appearance settings (theme, accent, corners, effects, layout, color mode and
 * UI size) so changes are visible before opening the real popup.
 */

type Palette = { bg: string; fg: string; muted: string; line: string; card: string; border: string };

const PALETTES: Record<AppSettings["theme"], Palette> = {
  light: { bg: "#ffffff", fg: "#151922", muted: "#7b8394", line: "#eceef3", card: "#f5f6f9", border: "rgba(0,0,0,0.08)" },
  dark: { bg: "#17191f", fg: "#eef0f4", muted: "#8b92a2", line: "#262a33", card: "#20232b", border: "rgba(255,255,255,0.08)" },
  transparent: { bg: "rgba(250,250,252,0.55)", fg: "#121620", muted: "#4b5363", line: "rgba(0,0,0,0.08)", card: "rgba(255,255,255,0.5)", border: "rgba(255,255,255,0.4)" },
};

/** Transparent theme follows the system appearance; this is its dark glass. */
const DARK_GLASS: Palette = {
  bg: "rgba(28,30,36,0.55)", fg: "#f2f3f6", muted: "rgba(255,255,255,0.65)", line: "rgba(255,255,255,0.1)", card: "rgba(255,255,255,0.08)", border: "rgba(255,255,255,0.12)",
};

const SCALE: Record<AppSettings["uiSize"], number> = {
  small: 0.85, default: 1, large: 1.15, scale130: 1.3, scale145: 1.45, scale160: 1.6,
};

type EntryColors = { activity: string; project: string; customer: string };

const ENTRIES: { project: string; activity: string; time: string; colors: EntryColors }[] = [
  { project: "Kimai Tray", activity: "Development", time: "0:45", colors: { activity: "#f97316", project: "#6366f1", customer: "#14b8a6" } },
  { project: "Website", activity: "Design", time: "1:10", colors: { activity: "#ec4899", project: "#0ea5e9", customer: "#84cc16" } },
  { project: "Internal", activity: "Meeting", time: "0:30", colors: { activity: "#eab308", project: "#a855f7", customer: "#14b8a6" } },
];

function colorDots(mode: AppSettings["colorMode"], c: EntryColors): string[] {
  switch (mode) {
    case "project": return [c.project];
    case "customer": return [c.customer];
    case "activity-project": return [c.activity, c.project];
    case "activity-customer": return [c.activity, c.customer];
    case "project-customer": return [c.project, c.customer];
    default: return [c.activity];
  }
}

function Dots({ colors }: { colors: string[] }) {
  return (
    <span className="inline-flex shrink-0 gap-[2px]">
      {colors.map((color, i) => (
        <i key={i} className="block h-[0.6em] w-[0.6em] rounded-full" style={{ background: color }} />
      ))}
    </span>
  );
}

function Label({ children, p }: { children: ReactNode; p: Palette }) {
  return (
    <div className="text-[0.8em] font-semibold uppercase tracking-[0.08em]" style={{ color: p.muted }}>
      {children}
    </div>
  );
}

export default function PopupPreview({
  settings,
  label,
  os = "macos",
  prefersDark = false,
}: {
  settings: AppSettings;
  label: string;
  /** Vibrancy (blurred glass) is native to macOS only. */
  os?: string;
  /** The transparent theme follows the system light/dark appearance. */
  prefersDark?: boolean;
}) {
  const transparent = settings.theme === "transparent";
  const p = transparent && prefersDark ? DARK_GLASS : PALETTES[settings.theme] ?? PALETTES.light;
  const flat = settings.reduceVisualEffects;
  // Without native vibrancy the popup background is simply see-through.
  const blur = transparent && os === "macos" && !flat;
  const palette = transparent && !blur
    ? { ...p, bg: "transparent", border: p.line }
    : p;
  const scale = Math.min(SCALE[settings.uiSize] ?? 1, 1.25);
  const time = settings.showSecondsInTimer ? "01:24:07" : "01:24";
  const main = ENTRIES[0];

  const recent = ENTRIES.map((e) => (
    <div key={e.project} className="flex items-center gap-[0.6em] text-[0.95em]">
      <Dots colors={colorDots(settings.colorMode, e.colors)} />
      <span className="truncate">{e.project} · {e.activity}</span>
      <em className="ml-auto font-mono text-[0.9em] not-italic" style={{ color: palette.muted }}>{e.time}</em>
    </div>
  ));

  const timeline = (
    <div className="flex h-[0.9em] gap-[2px] overflow-hidden rounded-[0.3em]">
      <i className="block" style={{ flex: 3, background: "#f97316" }} />
      <i className="block" style={{ flex: 2, background: "#ec4899" }} />
      <i className="block" style={{ flex: 1, background: "#eab308" }} />
      <i className="block" style={{ flex: 2, background: "var(--accent)" }} />
      <i className="block" style={{ flex: 2, background: palette.line }} />
    </div>
  );

  let body: ReactNode;
  if (settings.popupLayout === "focus") {
    body = (
      <>
        <div className="pt-[0.25em] text-center font-mono text-[2.3em] font-medium tracking-[-0.02em]">{time}</div>
        <div className="text-center" style={{ color: palette.muted }}>{main.project} · {main.activity}</div>
        <span className="self-center rounded-full bg-[var(--accent)] px-[1.3em] py-[0.35em] text-[0.9em] font-semibold text-white">■</span>
        <div className="flex gap-[0.3em] text-[0.85em]">
          <span className="rounded-full bg-[var(--accent)] px-[0.7em] py-[0.25em] text-white">●</span>
          <span className="rounded-full px-[0.7em] py-[0.25em]" style={{ background: palette.card }}>★</span>
          <span className="rounded-full px-[0.7em] py-[0.25em]" style={{ background: palette.card }}>☰</span>
        </div>
        {recent.slice(0, 2)}
      </>
    );
  } else if (settings.popupLayout === "taskbar") {
    body = (
      <>
        <div className="flex items-center gap-[0.6em]">
          <Dots colors={colorDots(settings.colorMode, main.colors)} />
          <b className="font-semibold">{main.project}</b>
          <em className="ml-auto font-mono font-semibold not-italic text-[var(--accent)]">{time}</em>
        </div>
        <div className="grid grid-cols-2 gap-[0.4em]">
          {ENTRIES.concat(ENTRIES[0]).map((e, i) => (
            <div key={i} className="flex items-center gap-[0.4em] truncate rounded-[0.5em] border p-[0.5em] text-[0.9em]" style={{ background: palette.card, borderColor: palette.line }}>
              <Dots colors={colorDots(settings.colorMode, e.colors)} />
              <span className="truncate">{e.project}</span>
            </div>
          ))}
        </div>
        <div className="flex justify-between font-mono text-[0.95em]"><span>Σ</span><b>6:12</b></div>
      </>
    );
  } else if (settings.popupLayout === "timeline") {
    body = (
      <>
        <Label p={palette}>Σ 6:12</Label>
        {timeline}
        <div className="flex justify-between font-mono text-[0.8em]" style={{ color: palette.muted }}>
          <span>8:00</span><span>12:00</span><span>16:00</span>
        </div>
        {recent}
      </>
    );
  } else {
    body = (
      <>
        <div
          className="flex items-center gap-[0.6em] rounded-[0.7em] border px-[0.8em] py-[0.7em]"
          style={{
            background: `color-mix(in oklab, var(--accent) 10%, ${palette.card})`,
            borderColor: "color-mix(in oklab, var(--accent) 25%, transparent)",
          }}
        >
          <Dots colors={colorDots(settings.colorMode, main.colors)} />
          <span className="min-w-0 truncate">
            <b className="font-semibold">{main.project}</b>
            <br />
            <span style={{ color: palette.muted }}>{main.activity}</span>
          </span>
          <span className="ml-auto font-mono text-[1.15em] font-medium">{time}</span>
        </div>
        {recent}
        <div className="flex justify-between font-mono text-[0.95em]"><span>Σ</span><b>6:12</b></div>
      </>
    );
  }

  const frame: CSSProperties = {
    fontSize: `${10 * scale}px`,
    background: palette.bg,
    color: palette.fg,
    borderColor: palette.border,
    borderRadius: settings.roundedPopupCorners ? 14 : 6,
    backdropFilter: blur ? "blur(18px) saturate(1.4)" : undefined,
    WebkitBackdropFilter: blur ? "blur(18px) saturate(1.4)" : undefined,
    transition: flat ? "none" : "all .25s",
  };

  return (
    <div
      role="img"
      aria-label={label}
      data-preview-blur={blur}
      className="relative grid place-items-center overflow-hidden px-4 py-[22px]"
      style={{
        background:
          "radial-gradient(120% 90% at 10% 0%, #7aa2ff 0%, transparent 55%), radial-gradient(90% 90% at 100% 100%, #ff9a76 0%, transparent 55%), linear-gradient(135deg, #9db6e8, #d8b8e8)",
      }}
    >
      <div className="w-[196px] overflow-hidden border shadow-[0_12px_30px_-8px_rgba(0,0,0,0.4)]" style={frame}>
        <div className="flex items-center justify-between border-b px-[1em] py-[0.8em] font-semibold" style={{ borderColor: palette.line }}>
          <span className="flex items-center gap-[0.4em]">
            <i className="block h-[1.3em] w-[1.3em] rounded-[0.4em] bg-[var(--accent)]" />
            KimaiTray
          </span>
          <span className="font-normal" style={{ color: palette.muted }}>⚙</span>
        </div>
        <div className="flex flex-col gap-[0.7em] px-[1em] py-[0.9em]">{body}</div>
      </div>
    </div>
  );
}
