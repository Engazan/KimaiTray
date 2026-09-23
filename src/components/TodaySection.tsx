import { useTranslation } from "react-i18next";
import type { TodayEntry, ColorMode } from "../types";
import TodayEntryItem from "./TodayEntryItem";
import { formatDuration } from "../utils/time";
import DailyGoalProgress from "./DailyGoalProgress";
import type { MouseEvent as ReactMouseEvent, MouseEventHandler } from "react";

export interface DailyGoalSettings {
  requiredMinutes: number;
  fullMinutes: number;
  isTimerRunning: boolean;
}

interface TodaySectionProps {
  entries: TodayEntry[];
  totalCount: number;
  totalDuration: number;
  hasMore: boolean;
  expanded: boolean;
  onToggleExpand: () => void;
  sortAsc: boolean;
  onToggleSort: () => void;
  isLoading: boolean;
  isError: boolean;
  onRetry: () => void;
  onEditEntry?: (entry: TodayEntry) => void;
  colorMode?: ColorMode;
  dailyGoal?: DailyGoalSettings;
  onRestartEntry?: (entry: TodayEntry) => void;
  onToggleFavoriteEntry?: (entry: TodayEntry) => void;
  isFavoriteEntry?: (entry: TodayEntry) => boolean;
  onDeleteEntry?: (entry: TodayEntry) => void;
  onRunningEntryContextMenu?: (event: ReactMouseEvent<HTMLElement>, entry: TodayEntry) => void;
  onHeaderContextMenu?: MouseEventHandler<HTMLDivElement>;
}

function LoadingSkeleton() {
  return (
    <div className="px-2.5 py-1.5 flex items-center gap-2 animate-pulse">
      <div className="w-[72px] h-3 rounded bg-gray-200 dark:bg-gray-700 shrink-0" />
      <span className="inline-block h-1.5 w-1.5 rounded-full bg-gray-200 dark:bg-gray-700 shrink-0" />
      <div className="flex-1 h-3 rounded bg-gray-200 dark:bg-gray-700" />
      <div className="w-8 h-3 rounded bg-gray-200 dark:bg-gray-700 shrink-0" />
    </div>
  );
}

export default function TodaySection({
  entries,
  totalCount,
  totalDuration,
  hasMore,
  expanded,
  onToggleExpand,
  sortAsc,
  onToggleSort,
  isLoading,
  isError,
  onRetry,
  onEditEntry,
  colorMode = "kimai",
  dailyGoal,
  onRestartEntry,
  onToggleFavoriteEntry,
  isFavoriteEntry,
  onDeleteEntry,
  onRunningEntryContextMenu,
  onHeaderContextMenu,
}: TodaySectionProps) {
  const { t } = useTranslation();

  return (
    <div className="mt-1.5">
      {/* Header */}
      <div className="px-3 py-1.5 flex items-center justify-between" onContextMenu={onHeaderContextMenu}>
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
            {t("today.title")}
          </span>
          {totalCount > 0 && (
            <span className="text-[10px] tabular-nums text-gray-500 dark:text-gray-400">
              {formatDuration(totalDuration)}
            </span>
          )}
        </div>
        {totalCount > 0 && (
          <button
            type="button"
            onClick={onToggleSort}
            className="focus-ring rounded p-0.5 text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 transition-colors"
            title={sortAsc ? t("today.newestFirst") : t("today.oldestFirst")}
            aria-label={sortAsc ? t("today.newestFirst") : t("today.oldestFirst")}
          >
            <svg
              aria-hidden="true"
              className={`h-3 w-3 transition-transform ${sortAsc ? "rotate-180" : ""}`}
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 7.5h12M3 12h8m-8 4.5h5M17.25 6v12m0 0l-3-3m3 3l3-3" />
            </svg>
          </button>
        )}
      </div>

      {dailyGoal && !isLoading && !isError && (
        <DailyGoalProgress
          totalDuration={totalDuration}
          requiredMinutes={dailyGoal.requiredMinutes}
          fullMinutes={dailyGoal.fullMinutes}
          isTimerRunning={dailyGoal.isTimerRunning}
        />
      )}

      {/* Content */}
      <div className="px-1.5 pb-1">
        {isLoading ? (
          <>
            <LoadingSkeleton />
            <LoadingSkeleton />
            <LoadingSkeleton />
          </>
        ) : isError ? (
          <div className="px-2.5 py-3 text-center">
            <p className="text-[11px] text-gray-500 dark:text-gray-400 mb-1.5">
              {t("today.loadError")}
            </p>
            <button
              type="button"
              onClick={onRetry}
              className="focus-ring rounded text-[11px] text-[var(--accent)] hover:underline"
            >
              {t("common.retry")}
            </button>
          </div>
        ) : entries.length === 0 ? (
          <div className="px-2.5 py-3 text-center">
            <p className="text-[11px] text-gray-500 dark:text-gray-400">
              {t("today.empty")}
            </p>
          </div>
        ) : (
          <>
            {entries.map((entry) => (
              <TodayEntryItem
                key={entry.id}
                entry={entry}
                colorMode={colorMode}
                onEdit={onEditEntry}
                onRestart={onRestartEntry}
                onToggleFavorite={onToggleFavoriteEntry}
                isFavorite={isFavoriteEntry?.(entry)}
                onDelete={onDeleteEntry}
                onRunningContextMenu={onRunningEntryContextMenu}
              />
            ))}
            {hasMore && !expanded && (
              <button
                type="button"
                onClick={onToggleExpand}
                className="w-full py-1.5 text-[11px] text-[var(--accent)] hover:underline focus-ring rounded transition-colors"
              >
                {t("today.showAll", { count: totalCount })}
              </button>
            )}
            {expanded && hasMore && (
              <button
                type="button"
                onClick={onToggleExpand}
                className="w-full py-1.5 text-[11px] text-gray-500 dark:text-gray-400 hover:underline focus-ring rounded transition-colors"
              >
                {t("today.showLess")}
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
}
