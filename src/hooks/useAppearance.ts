import { useEffect } from "react";
import { loadSettings, onSettingsChange } from "../settings/service";
import { setPopupCornerRadius, setPopupSize, setPopupVibrancy, setDisplayMode, setTrayIconSize, setTrayIconShape } from "../api/trayApi";
import type { AppSettings } from "../types";

const POPUP_BASE_WIDTH = 360;
const POPUP_BASE_HEIGHT = 640;

const UI_SIZE_SCALE: Record<AppSettings["uiSize"], number> = {
  small: 0.85,
  default: 1,
  large: 1.15,
};

let mediaCleanup: (() => void) | null = null;

let prevSize = "";
let prevRadius = -1;
let prevVibrancy = -1;
let prevDisplayMode = "";
let prevTrayIconSize = "";
let prevTrayIconShape = "";

function applyThemeClass(theme: AppSettings["theme"]) {
  if (theme === "dark") {
    document.documentElement.classList.add("dark");
  } else if (theme === "light") {
    document.documentElement.classList.remove("dark");
  } else {
    const isDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    document.documentElement.classList.toggle("dark", isDark);
  }
}

function apply(s: AppSettings) {
  document.documentElement.dataset.accent = s.accentStyle;
  document.documentElement.dataset.reduceMotion = String(s.reduceVisualEffects);
  document.documentElement.dataset.uiSize = s.uiSize;
  document.documentElement.dataset.roundedPopup = String(s.roundedPopupCorners);
  document.documentElement.dataset.theme = s.theme;
  document.documentElement.dataset.layout = s.popupLayout;

  applyThemeClass(s.theme);

  if (mediaCleanup) {
    mediaCleanup();
    mediaCleanup = null;
  }

  if (s.theme === "transparent") {
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const handler = (e: MediaQueryListEvent) => {
      document.documentElement.classList.toggle("dark", e.matches);
    };
    mq.addEventListener("change", handler);
    mediaCleanup = () => mq.removeEventListener("change", handler);
  }

  document.documentElement.dataset.displayMode = s.displayMode ?? "tray";

  const isDetached = s.displayMode === "detached";

  if (!isDetached) {
    const scale = UI_SIZE_SCALE[s.uiSize];
    const w = Math.round(POPUP_BASE_WIDTH * scale);
    const h = Math.round(POPUP_BASE_HEIGHT * scale);
    const sizeKey = `${w}:${h}:${scale}`;
    if (sizeKey !== prevSize) {
      prevSize = sizeKey;
      setPopupSize(w, h, scale);
    }
  }

  const radius = s.roundedPopupCorners && !isDetached ? 10.0 : 0.0;
  if (radius !== prevRadius) {
    prevRadius = radius;
    setPopupCornerRadius(radius);
  }

  if (document.documentElement.dataset.window === "tray-popup") {
    const vibrancy = s.theme === "transparent" ? 1 : 0;
    if (vibrancy !== prevVibrancy) {
      prevVibrancy = vibrancy;
      setPopupVibrancy(vibrancy === 1);
    }
    const dm = s.displayMode ?? "tray";
    if (dm !== prevDisplayMode) {
      prevDisplayMode = dm;
      setDisplayMode(dm);
    }
    const iconSize = s.trayIconSize ?? "medium";
    if (iconSize !== prevTrayIconSize) {
      prevTrayIconSize = iconSize;
      setTrayIconSize(iconSize);
    }
    const iconShape = s.trayIconShape ?? "dot";
    if (iconShape !== prevTrayIconShape) {
      prevTrayIconShape = iconShape;
      setTrayIconShape(iconShape);
    }
  }
}

export function useAppearance() {
  useEffect(() => {
    loadSettings().then(apply);
    const cleanup = onSettingsChange(apply);
    return () => {
      cleanup.then((fn) => fn());
      if (mediaCleanup) {
        mediaCleanup();
        mediaCleanup = null;
      }
    };
  }, []);
}
