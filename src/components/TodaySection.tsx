import { useTranslation } from "react-i18next";
import type { TodayEntry, ColorMode } from "../types";
import TodayEntryItem from "./TodayEntryItem";
import { formatDuration } from "../utils/time";
import DailyGoalProgress from "./DailyGoalProgress";

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
  colorMode?: ColorMode;
  dailyGoal?: DailyGoalSettings;
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
  colorMode = "kimai",
  dailyGoal,
}: TodaySectionProps) {
  const { t } = useTranslation();

  return (
    <div className="mt-1.5">
      {/* Header */}
      <div className="px-3 py-1.5 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500">
            {t("today.title")}
          </span>
          {totalCount > 0 && (
            <span className="text-[10px] tabular-nums text-gray-400 dark:text-gray-500">
              {formatDuration(totalDuration)}
            </span>
          )}
        </div>
        {totalCount > 0 && (
          <button
            onClick={onToggleSort}
            className="text-[10px] text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 transition-colors focus:outline-none"
            title={sortAsc ? t("today.newestFirst") : t("today.oldestFirst")}
          >
            {sortAsc ? "↑" : "↓"}
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
            <p className="text-[11px] text-gray-400 dark:text-gray-500 mb-1.5">
              {t("today.loadError")}
            </p>
            <button
              onClick={onRetry}
              className="text-[11px] text-[var(--accent)] hover:underline focus:outline-none"
            >
              {t("common.retry")}
            </button>
          </div>
        ) : entries.length === 0 ? (
          <div className="px-2.5 py-3 text-center">
            <p className="text-[11px] text-gray-400 dark:text-gray-500">
              {t("today.empty")}
            </p>
          </div>
        ) : (
          <>
            {entries.map((entry) => (
              <TodayEntryItem key={entry.id} entry={entry} colorMode={colorMode} />
            ))}
            {hasMore && !expanded && (
              <button
                onClick={onToggleExpand}
                className="w-full py-1.5 text-[11px] text-[var(--accent)] hover:underline focus:outline-none transition-colors"
              >
                {t("today.showAll", { count: totalCount })}
              </button>
            )}
            {expanded && hasMore && (
              <button
                onClick={onToggleExpand}
                className="w-full py-1.5 text-[11px] text-gray-400 dark:text-gray-500 hover:underline focus:outline-none transition-colors"
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
