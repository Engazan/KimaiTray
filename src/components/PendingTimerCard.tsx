import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import type { ColorMode } from "../types";
import type { StartPreview, StartRetryState } from "../hooks/useStartTask";
import ColorDots from "./ColorDots";
import TagsList from "./TagsList";

interface PendingTimerCardProps {
  preview: StartPreview;
  compact?: boolean;
  focusMode?: boolean;
  colorMode?: ColorMode;
  /** Reserve the same optional rows as the active card so the swap keeps its height. */
  showNote?: boolean;
  showTags?: boolean;
  /** Set while a failed start waits in the retry queue. */
  retry?: StartRetryState | null;
  onRetryNow?: () => void;
  onCancelRetry?: () => void;
}

function Spinner() {
  return (
    <div className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-emerald-400/30 border-t-emerald-500" />
  );
}

function useSecondsUntil(at: number | null | undefined): number | null {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (at == null) return;
    setNow(Date.now());
    const interval = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(interval);
  }, [at]);
  return at == null ? null : Math.max(0, Math.ceil((at - now) / 1000));
}

/** Retry countdown with Retry now and Cancel for a queued start. */
export function RetryStatus({
  retry,
  onRetryNow,
  onCancelRetry,
}: {
  retry: StartRetryState;
  onRetryNow?: () => void;
  onCancelRetry?: () => void;
}) {
  const { t } = useTranslation();
  const seconds = useSecondsUntil(retry.nextRetryAt);
  const button =
    "rounded px-1.5 py-0.5 text-[10px] font-medium text-amber-800 hover:bg-amber-100 dark:text-amber-300 dark:hover:bg-amber-900/40";
  return (
    <div
      className="mt-1.5 flex items-center gap-1.5 pl-4 text-[10px] text-amber-700 dark:text-amber-400"
      title={retry.lastError}
    >
      <span className="min-w-0 flex-1 truncate">
        {seconds === null
          ? t("tray.startRetrying", { attempt: retry.attempt + 1 })
          : t("tray.startRetryIn", { seconds, attempt: retry.attempt + 1 })}
      </span>
      {seconds !== null && onRetryNow && (
        <button type="button" className={button} onClick={onRetryNow}>
          {t("tray.retryNow")}
        </button>
      )}
      {onCancelRetry && (
        <button type="button" className={button} onClick={onCancelRetry}>
          {t("common.cancel")}
        </button>
      )}
    </div>
  );
}

/**
 * Placeholder for a timer whose start request is still in flight. It mirrors
 * ActiveTimerCard's layout so the real card can replace it without a jump.
 */
export default function PendingTimerCard({
  preview,
  compact,
  focusMode,
  colorMode = "kimai",
  showNote,
  showTags,
  retry,
  onRetryNow,
  onCancelRetry,
}: PendingTimerCardProps) {
  const { t } = useTranslation();
  const dots = (
    <ColorDots
      activityColor={preview.activityColor}
      projectColor={preview.projectColor}
      customerColor={preview.customerColor}
      colorMode={colorMode}
    />
  );
  const retryStatus = retry && (
    <RetryStatus retry={retry} onRetryNow={onRetryNow} onCancelRetry={onCancelRetry} />
  );

  if (compact) {
    return (
      <div
        role="status"
        aria-label={t("tray.starting")}
        className="mx-3 mt-1.5 rounded-lg bg-emerald-50/70 dark:bg-emerald-950/30 border border-emerald-200/60 dark:border-emerald-800/40 animate-timer-in"
      >
        <div className="flex min-h-5 items-center gap-2 px-2.5 py-1.5">
          {dots}
          <span className="text-[11px] font-medium text-gray-800 dark:text-gray-200 truncate">
            {preview.project}
          </span>
          <span className="text-[10px] text-gray-500 dark:text-gray-400 truncate">
            {preview.activity}
          </span>
          <span className="ml-auto text-[11px] text-emerald-700/80 dark:text-emerald-400/80 shrink-0">
            {t("tray.starting")}
          </span>
          <Spinner />
        </div>
        {retryStatus && <div className="px-2.5 pb-1.5 -mt-1">{retryStatus}</div>}
      </div>
    );
  }

  return (
    <div
      role="status"
      aria-label={t("tray.starting")}
      className="mx-3 mt-2 rounded-lg bg-emerald-50/70 dark:bg-emerald-950/30 border border-emerald-200/60 dark:border-emerald-800/40 animate-timer-in"
    >
      <div className="px-3 py-2.5">
        <div className="flex items-center gap-2 mb-1">
          {dots}
          <span className="text-xs font-medium text-gray-800 dark:text-gray-200 truncate">
            {preview.project}
          </span>
          <span className="text-[10px] text-gray-500 dark:text-gray-400">
            {preview.activity}
          </span>
        </div>
        {(showNote || preview.description) && (
          <p
            className={`pl-4 mb-1.5 text-[11px] truncate ${
              preview.description
                ? "text-gray-500 dark:text-gray-400"
                : "italic text-gray-400 dark:text-gray-500"
            }`}
          >
            {preview.description || t("timer.addNote")}
          </p>
        )}
        {showTags && (
          <div className="pl-4 mb-1.5">
            {preview.tags?.length ? (
              <div className="py-0.5">
                <TagsList tags={preview.tags} maxVisible={3} />
              </div>
            ) : (
              <span className="block text-[10px] italic text-gray-400 dark:text-gray-500">
                {t("tags.addTags")}
              </span>
            )}
          </div>
        )}
        <div className="flex items-center justify-between pl-4">
          <span
            className={`${focusMode ? "text-2xl" : "text-lg"} font-mono font-semibold tabular-nums text-emerald-700/50 dark:text-emerald-400/50 tracking-tight animate-pulse`}
          >
            00:00:00
          </span>
          <span className="flex items-center gap-1.5 text-[11px] text-emerald-700/80 dark:text-emerald-400/80">
            {t("tray.starting")}
            <Spinner />
          </span>
        </div>
        {retryStatus}
      </div>
    </div>
  );
}
