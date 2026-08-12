import { useEffect } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { loadSettings, onSettingsChange, patchSettings } from "../settings/service";
import { setPopupCornerRadius, setPopupSize, setPopupZoom, setPopupVibrancy, setDisplayMode, setTrayIconSize, setTrayIconShape } from "../api/trayApi";
import type { AppSettings } from "../types";

const POPUP_BASE_WIDTH = 360;
const POPUP_BASE_HEIGHT = 640;
const POPUP_MIN_HEIGHT = 320;
const POPUP_MAX_HEIGHT = 1200;

const UI_SIZE_SCALE: Record<AppSettings["uiSize"], number> = {
  small: 0.85,
  default: 1,
  large: 1.15,
  scale130: 1.3,
  scale145: 1.45,
  scale160: 1.6,
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
  const scale = UI_SIZE_SCALE[s.uiSize];

  if (!isDetached) {
    const w = Math.round(POPUP_BASE_WIDTH * scale);
    const baseHeight = s.popupHeight || POPUP_BASE_HEIGHT;
    const h = Math.round(baseHeight * scale);
    const sizeKey = `tray:${w}:${h}:${scale}`;
    if (sizeKey !== prevSize) {
      prevSize = sizeKey;
      setPopupSize(w, h, scale);
    }
  } else {
    const sizeKey = `detached:${scale}`;
    if (sizeKey !== prevSize) {
      prevSize = sizeKey;
      setPopupZoom(scale);
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
    let active = true;
    let currentSettings: AppSettings | null = null;
    let resizeTimer: ReturnType<typeof setTimeout> | null = null;
    let pendingHeight: number | null = null;
    let removeResizeListener: (() => void) | null = null;
    const currentWindow = getCurrentWindow();
    const resizeListener =
      document.documentElement.dataset.window === "tray-popup"
        ? currentWindow.scaleFactor().then((nativeScale) =>
            currentWindow.onResized(({ payload }) => {
              const settings = currentSettings;
              if (!settings || settings.displayMode === "detached") return;

              const scale = UI_SIZE_SCALE[settings.uiSize];
              const nextHeight = Math.min(
                POPUP_MAX_HEIGHT,
                Math.max(
                  POPUP_MIN_HEIGHT,
                  Math.round(payload.height / nativeScale / scale),
                ),
              );
              if (nextHeight === settings.popupHeight) return;

              currentSettings = { ...settings, popupHeight: nextHeight };
              pendingHeight = nextHeight;
              if (resizeTimer) clearTimeout(resizeTimer);
              resizeTimer = setTimeout(() => {
                const height = pendingHeight!;
                pendingHeight = null;
                void patchSettings({ popupHeight: height }).catch(() => {});
              }, 250);
            }),
          )
        : Promise.resolve<() => void>(() => {});

    const applyCurrent = (settings: AppSettings) => {
      if (!active) return;
      currentSettings = settings;
      apply(settings);
    };

    loadSettings().then(applyCurrent);
    const cleanup = onSettingsChange(applyCurrent);
    void resizeListener.then((cleanupResize) => {
      if (active) removeResizeListener = cleanupResize;
      else cleanupResize();
    });

    return () => {
      active = false;
      if (resizeTimer) clearTimeout(resizeTimer);
      if (removeResizeListener) removeResizeListener();
      else void resizeListener.then((cleanupResize) => cleanupResize());
      cleanup.then((fn) => fn());
      if (mediaCleanup) {
        mediaCleanup();
        mediaCleanup = null;
      }
    };
  }, []);
}
