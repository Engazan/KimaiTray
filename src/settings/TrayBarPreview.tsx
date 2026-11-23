import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import type { AppSettings } from "../types";
import type { PlatformInfo } from "../platform";

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
export function ShapeGlyph({ shape, px, color = GLYPH_FILL }: { shape: AppSettings["trayIconShape"]; px: number; color?: string }) {
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

/** Fixed sample clock so the preview is stable. */
const SAMPLE_TIME = new Date(2026, 10, 23, 14, 32);

/** Small monochrome glyphs standing in for neighbouring system tray icons. */
function SysGlyphs({ className = "" }: { className?: string }) {
  return (
    <span className={`flex items-center gap-2 ${className}`} aria-hidden="true">
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
        <path d="M2 9a15 15 0 0 1 20 0M5.5 12.5a10 10 0 0 1 13 0M9 16a5 5 0 0 1 6 0" />
        <circle cx="12" cy="19.5" r="1" fill="currentColor" />
      </svg>
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M4 9v6h4l5 4V5L8 9H4z" />
        <path d="M16.5 8.5a5 5 0 0 1 0 7" />
      </svg>
      <svg width="16" height="13" viewBox="0 0 28 24" fill="none" stroke="currentColor" strokeWidth="2.2">
        <rect x="2" y="6" width="21" height="12" rx="3" />
        <rect x="5" y="9" width="12" height="6" rx="1" fill="currentColor" stroke="none" />
        <path d="M25.5 10v4" strokeLinecap="round" />
      </svg>
    </span>
  );
}

/**
 * A miniature of the place where the tray icon lives on the current OS:
 * the macOS menu bar, the Windows taskbar notification area, or a generic
 * Linux desktop panel. The text label next to the icon only exists on macOS,
 * so callers pass an empty `label` elsewhere.
 */
export default function TrayBarPreview({
  os,
  dark,
  icon,
  label,
  ariaLabel,
}: {
  os: PlatformInfo["os"];
  dark: boolean;
  icon: ReactNode;
  label: string;
  ariaLabel: string;
}) {
  const { i18n } = useTranslation();
  const lang = i18n?.language || undefined;
  const fmt = (opts: Intl.DateTimeFormatOptions) => SAMPLE_TIME.toLocaleString(lang, opts);
  const time = fmt({ hour: "2-digit", minute: "2-digit" });

  if (os === "windows") {
    return (
      <div role="img" aria-label={ariaLabel} data-tray-preview="windows" className="overflow-hidden rounded-[10px] bg-gradient-to-br from-[#3a6ea5] to-[#7aa7d8]">
        <div className="h-6" />
        <div
          className={`flex h-10 items-center justify-end gap-3 px-3 text-[11px] backdrop-blur ${
            dark ? "bg-[#202020]/90 text-white" : "bg-[#f3f3f3]/90 text-[#1a1a1a]"
          }`}
        >
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden="true">
            <path d="M6 15l6-6 6 6" />
          </svg>
          <span className={`flex h-7 w-7 items-center justify-center rounded ${dark ? "bg-white/10" : "bg-black/5"}`}>{icon}</span>
          <SysGlyphs />
          <span className="flex flex-col items-end leading-tight tabular-nums">
            <span>{time}</span>
            <span>{fmt({ day: "numeric", month: "numeric", year: "numeric" })}</span>
          </span>
        </div>
      </div>
    );
  }

  if (os === "linux") {
    return (
      <div
        role="img"
        aria-label={ariaLabel}
        data-tray-preview="linux"
        className="flex h-[30px] items-center justify-between overflow-hidden rounded-[10px] bg-[#1d1d1f] px-3 text-[12px] font-medium text-white/90"
      >
        <span className="w-24" />
        <span className="tabular-nums">{fmt({ weekday: "short" })} {time}</span>
        <span className="flex w-24 items-center justify-end gap-2.5">
          <span className="flex items-center">{icon}</span>
          <SysGlyphs className="opacity-85" />
        </span>
      </div>
    );
  }

  return (
    <div
      role="img"
      aria-label={ariaLabel}
      data-tray-preview="macos"
      className="flex h-[34px] items-center justify-end gap-3.5 overflow-hidden rounded-[10px] bg-gradient-to-r from-[#7c95c9] to-[#b79fd6] px-3 text-[12px] font-medium text-white [text-shadow:0_1px_1px_rgba(0,0,0,0.15)]"
    >
      <SysGlyphs className="opacity-85" />
      <span className="flex items-center gap-1.5 rounded-[5px] bg-white/25 px-[7px] py-[3px]">
        {icon}
        {label && <span className="font-mono text-[11.5px] tabular-nums">{label}</span>}
      </span>
      <span className="opacity-85">{fmt({ weekday: "short", day: "numeric", month: "numeric" })} {time}</span>
    </div>
  );
}
