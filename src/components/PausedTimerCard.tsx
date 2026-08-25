import { useTranslation } from "react-i18next";
import type { MouseEvent as ReactMouseEvent } from "react";
import type { PausedTimerData } from "../api/pauseStore";
import type { ColorMode } from "../types";
import TagsList from "./TagsList";
import ColorDots from "./ColorDots";
import { separator, showContextMenu, type ContextMenuEntry } from "./contextMenu";

interface PausedTimerCardProps {
  paused: PausedTimerData;
  onResume: () => void;
  onStop: () => void;
  isResuming?: boolean;
  isStopping?: boolean;
  error?: string | null;
  onDismissError?: () => void;
  compact?: boolean;
  colorMode?: ColorMode;
  showDescriptionOnHover?: boolean;
}

function formatPausedAt(iso: string): string {
  return new Date(iso).toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function PausedTimerCard({
  paused,
  onResume,
  onStop,
  isResuming,
  isStopping,
  error,
  onDismissError,
  compact,
  colorMode = "kimai",
  showDescriptionOnHover = false,
}: PausedTimerCardProps) {
  const { t } = useTranslation();
  const busy = !!isResuming || !!isStopping;
  const cardAnim = busy ? "animate-card-out" : "animate-timer-in";
  const description = paused.description.trim();
  const hasDescription = showDescriptionOnHover && description.length > 0;
  /* v8 ignore start -- callbacks execute from a native OS context menu */
  const contextEntries: ContextMenuEntry[] = [
    { text: t("pause.resume"), enabled: !busy, action: onResume },
    separator(),
    {
      text: t("pause.discard"),
      enabled: !busy,
      action: () => {
        if (window.confirm(t("contextMenu.discardPausedConfirm"))) onStop();
      },
    },
  ];
  const openCardContextMenu = (event: ReactMouseEvent<HTMLElement>) => {
    void showContextMenu(event, contextEntries);
  };
  /* v8 ignore stop */

  if (compact) {
    return (
      <div
        onContextMenu={openCardContextMenu}
        className={`mx-3 mt-1.5 rounded-lg bg-amber-50/70 dark:bg-amber-950/20 border border-amber-200/60 dark:border-amber-800/40 ${cardAnim}`}
      >
        <div className="px-2.5 py-1.5 flex items-center gap-2">
          <ColorDots
            activityColor={paused.activityColor ?? ""}
            projectColor={paused.projectColor}
            customerColor={paused.customerColor ?? ""}
            colorMode={colorMode}
          />
          <div className="min-w-0 flex flex-1 items-center gap-2">
            <span className="min-w-0 max-w-[55%] shrink truncate text-[11px] font-medium leading-4 text-gray-800 dark:text-gray-200">
              {paused.project}
            </span>
            <span
              title={hasDescription ? description : undefined}
              className="group relative h-4 min-w-0 flex-1 overflow-hidden text-[10px] leading-4 text-gray-400 dark:text-gray-500"
            >
              {hasDescription ? (
                <>
                  <span className="absolute inset-0 truncate opacity-100 transition-opacity duration-150 ease-out group-hover:opacity-0">
                    {paused.activity}
                  </span>
                  <span className="absolute inset-0 truncate opacity-0 transition-opacity duration-150 ease-out group-hover:opacity-100">
                    {description}
                  </span>
                </>
              ) : (
                <span className="block truncate">{paused.activity}</span>
              )}
            </span>
          </div>
          <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[9px] font-semibold text-amber-700 dark:bg-amber-900/40 dark:text-amber-400 shrink-0">
            {t("pause.paused")}
          </span>
          <div className="flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              onClick={onResume}
              disabled={busy}
              title={t("pause.resume")}
              aria-label={t("pause.resume")}
              className="p-1 rounded-md bg-[var(--accent)]/10 text-[var(--accent)] hover:bg-[var(--accent)]/20 disabled:opacity-50 transition-colors focus:outline-none"
            >
              {isResuming ? (
                <div className="h-3 w-3 animate-spin rounded-full border-2 border-[var(--accent)]/30 border-t-[var(--accent)]" />
              ) : (
                <svg className="h-3 w-3" viewBox="0 0 24 24" fill="currentColor"><path d="M6 4l15 8-15 8V4z" /></svg>
              )}
            </button>
            <button
              type="button"
              onClick={onStop}
              disabled={busy}
              title={t("timer.stopTimer")}
              aria-label={t("timer.stopTimer")}
              className="p-1 rounded-md bg-red-500/10 text-red-600 dark:text-red-400 hover:bg-red-500/20 disabled:opacity-50 transition-colors focus:outline-none"
            >
              {isStopping ? (
                <div className="h-3 w-3 animate-spin rounded-full border-2 border-red-400/30 border-t-red-500" />
              ) : (
                <svg className="h-3 w-3" viewBox="0 0 24 24" fill="currentColor"><rect x="4" y="4" width="16" height="16" rx="2" /></svg>
              )}
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      onContextMenu={openCardContextMenu}
      className={`mx-3 mt-2 rounded-lg bg-amber-50/70 dark:bg-amber-950/20 border border-amber-200/60 dark:border-amber-800/40 ${cardAnim}`}
    >
      <div className="px-3 py-2.5">
        {/* Row 1: Project + Activity + Paused badge */}
        <div className="flex items-center gap-2 mb-1">
          <ColorDots
            activityColor={paused.activityColor ?? ""}
            projectColor={paused.projectColor}
            customerColor={paused.customerColor ?? ""}
            colorMode={colorMode}
          />
          <span className="text-xs font-medium text-gray-800 dark:text-gray-200 truncate">
            {paused.project}
          </span>
          <span className="text-[10px] text-gray-400 dark:text-gray-500">
            {paused.activity}
          </span>
          <span className="ml-auto rounded bg-amber-100 px-1.5 py-0.5 text-[9px] font-semibold text-amber-700 dark:bg-amber-900/40 dark:text-amber-400 shrink-0">
            {t("pause.paused")}
          </span>
        </div>

        {/* Row 2: Description */}
        {paused.description && (
          <p className="pl-4 mb-1 text-[11px] text-gray-500 dark:text-gray-400 truncate">
            {paused.description}
          </p>
        )}

        {/* Row 3: Tags */}
        {paused.tags.length > 0 && (
          <div className="pl-4 mb-1.5">
            <TagsList tags={paused.tags} maxVisible={3} />
          </div>
        )}

        {/* Row 4: Paused time + buttons */}
        <div className="flex items-center justify-between pl-4">
          <span className="text-[10px] text-amber-600 dark:text-amber-400">
            {t("pause.pausedSince", { time: formatPausedAt(paused.pausedAt) })}
          </span>

          <div className="flex items-center gap-1.5 shrink-0 ml-2">
            <button
              type="button"
              onClick={onResume}
              disabled={busy}
              title={t("pause.resume")}
              aria-label={t("pause.resume")}
              className="p-1.5 rounded-md
                bg-[var(--accent)]/10 text-[var(--accent)]
                hover:bg-[var(--accent)]/20 active:bg-[var(--accent)]/30
                disabled:opacity-50 disabled:cursor-not-allowed
                transition-colors focus:outline-none focus-visible:ring-1 focus-visible:ring-[var(--accent)]"
            >
              {isResuming ? (
                <div className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-[var(--accent)]/30 border-t-[var(--accent)]" />
              ) : (
                <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="currentColor"><path d="M6 4l15 8-15 8V4z" /></svg>
              )}
            </button>
            <button
              type="button"
              onClick={onStop}
              disabled={busy}
              title={t("timer.stopTimer")}
              aria-label={t("timer.stopTimer")}
              className="p-1.5 rounded-md
                bg-red-500/10 text-red-600 dark:text-red-400
                hover:bg-red-500/20 active:bg-red-500/30
                disabled:opacity-50 disabled:cursor-not-allowed
                transition-colors focus:outline-none focus-visible:ring-1 focus-visible:ring-red-400"
            >
              {isStopping ? (
                <div className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-red-400/30 border-t-red-500" />
              ) : (
                <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="currentColor"><rect x="4" y="4" width="16" height="16" rx="2" /></svg>
              )}
            </button>
          </div>
        </div>

        {/* Error */}
        {error && (
          <div className="pl-4 mt-1.5 flex items-center gap-1.5">
            <span className="text-[10px] text-red-500 dark:text-red-400 truncate flex-1">
              {error}
            </span>
            {onDismissError && (
              <button
                type="button"
                onClick={onDismissError}
                aria-label={t("common.dismiss")}
                className="text-red-400 hover:text-red-600 dark:text-red-500 dark:hover:text-red-300 text-xs leading-none shrink-0"
              >
                ✕
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
