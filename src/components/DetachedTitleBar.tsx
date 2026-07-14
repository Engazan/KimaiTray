import type { ReactNode } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { useTranslation } from "react-i18next";

const isMac = navigator.platform.toUpperCase().includes("MAC");

function TrafficLight({ color, hoverColor, onClick, label, children }: {
  color: string;
  hoverColor: string;
  onClick: () => void;
  label: string;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className="group h-3 w-3 rounded-full flex items-center justify-center transition-colors focus:outline-none focus-visible:ring-1 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-1"
      style={{ backgroundColor: color }}
      onMouseEnter={(event) => {
        event.currentTarget.style.backgroundColor = hoverColor;
      }}
      onMouseLeave={(event) => {
        event.currentTarget.style.backgroundColor = color;
      }}
    >
      <span className="hidden group-hover:block text-[8px] leading-none font-bold text-black/50">
        {children}
      </span>
    </button>
  );
}

interface DetachedTitleBarProps {
  pinned: boolean;
  onTogglePin: () => void;
  pinLabel: string;
  /** Hide the pin ("always on top") control where it has no effect, e.g. on
      Wayland where X11 keep-above is ignored. Defaults to shown. */
  showPin?: boolean;
  transparent?: boolean;
}

export default function DetachedTitleBar({
  pinned,
  onTogglePin,
  pinLabel,
  showPin = true,
  transparent,
}: DetachedTitleBarProps) {
  const { t } = useTranslation();
  const win = getCurrentWindow();
  const barBg = transparent
    ? "bg-white/30 dark:bg-black/20 backdrop-blur-sm"
    : "bg-gray-50/80 dark:bg-[#141414]";

  const pinButton = !showPin ? null : (
    <button
      type="button"
      onClick={onTogglePin}
      title={pinLabel}
      aria-label={pinLabel}
      className={`rounded p-1 transition-colors focus:outline-none focus-visible:ring-1 focus-visible:ring-[var(--accent)]
        ${pinned
          ? "text-[var(--accent)] bg-[var(--accent)]/10"
          : "text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300"
        }`}
    >
      <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        {pinned ? (
          <path strokeLinecap="round" strokeLinejoin="round" d="M16 4v4l2 2v2h-5l-1 8-1-8H6v-2l2-2V4a1 1 0 011-1h6a1 1 0 011 1z" />
        ) : (
          <path strokeLinecap="round" strokeLinejoin="round" d="M16 4v4l2 2v2h-5l-1 8-1-8H6v-2l2-2V4a1 1 0 011-1h6a1 1 0 011 1z" opacity={0.5} />
        )}
      </svg>
    </button>
  );

  if (isMac) {
    return (
      <div
        data-tauri-drag-region
        className={`relative flex h-8 shrink-0 items-center border-b border-gray-100 dark:border-gray-800 ${barBg} px-2.5 select-none`}
      >
        <div className="flex items-center gap-1.5">
          <TrafficLight color="#ff5f57" hoverColor="#ff3b30" onClick={() => win.hide()} label={t("common.hide")}>✕</TrafficLight>
          <TrafficLight color="#febc2e" hoverColor="#f0a000" onClick={() => win.minimize()} label={t("common.minimize")}>−</TrafficLight>
          <TrafficLight color="#28c840" hoverColor="#1aab29" onClick={() => win.toggleMaximize()} label={t("common.maximize")}>+</TrafficLight>
        </div>
        <span
          data-tauri-drag-region
          className="absolute inset-0 flex items-center justify-center text-[10px] font-medium text-gray-400 dark:text-gray-500 pointer-events-none"
        >
          KimaiTray
        </span>
        <div className="ml-auto">{pinButton}</div>
      </div>
    );
  }

  return (
    <div
      data-tauri-drag-region
      className={`flex h-8 shrink-0 items-center justify-between border-b border-gray-100 dark:border-gray-800 ${barBg} px-2 select-none`}
    >
      <span
        data-tauri-drag-region
        className="text-[10px] font-medium text-gray-400 dark:text-gray-500 pointer-events-none"
      >
        KimaiTray
      </span>
      <div className="flex items-center gap-0.5">
        {pinButton}
        <button
          type="button"
          onClick={() => win.minimize()}
          aria-label={t("common.minimize")}
          className="rounded p-1 text-gray-400 hover:text-gray-600 hover:bg-gray-200/60 dark:text-gray-500 dark:hover:text-gray-300 dark:hover:bg-gray-700/60 transition-colors focus:outline-none focus-visible:ring-1 focus-visible:ring-[var(--accent)]"
        >
          <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" d="M5 12h14" />
          </svg>
        </button>
        <button
          type="button"
          onClick={() => win.toggleMaximize()}
          aria-label={t("common.maximize")}
          className="rounded p-1 text-gray-400 hover:text-gray-600 hover:bg-gray-200/60 dark:text-gray-500 dark:hover:text-gray-300 dark:hover:bg-gray-700/60 transition-colors focus:outline-none focus-visible:ring-1 focus-visible:ring-[var(--accent)]"
        >
          <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
            <rect x="5" y="5" width="14" height="14" rx="1" />
          </svg>
        </button>
        <button
          type="button"
          onClick={() => win.hide()}
          aria-label={t("common.hide")}
          className="rounded p-1 text-gray-400 hover:text-red-500 hover:bg-red-100/60 dark:text-gray-500 dark:hover:text-red-400 dark:hover:bg-red-900/40 transition-colors focus:outline-none focus-visible:ring-1 focus-visible:ring-[var(--accent)]"
        >
          <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
    </div>
  );
}
