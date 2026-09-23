import { useTranslation } from "react-i18next";
import type { TodayEntry, ColorMode } from "../types";
import TodayEntryItem from "./TodayEntryItem";
import { formatDuration, formatTime } from "../utils/time";
import DailyGoalProgress from "./DailyGoalProgress";
import TodayTimelineBar from "./TodayTimelineBar";
import { computeTodayGaps, type TodayGap } from "../utils/todayGaps";
import { Fragment, type MouseEvent as ReactMouseEvent, type MouseEventHandler } from "react";

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
  /** All of today's entries, including those collapsed behind "show all". */
  timelineEntries?: TodayEntry[];
  /** Opens a new-timer form starting at the given Kimai datetime. */
  onFillGap?: (beginIso: string) => void;
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

function GapRow({ gap, onFill }: { gap: TodayGap; onFill: (beginIso: string) => void }) {
  const { t } = useTranslation();
  return (
    <button
      type="button"
      onClick={() => onFill(gap.beginIso)}
      title={t("today.fillGap", { time: formatTime(gap.beginIso) })}
      className="focus-ring group flex w-full items-center gap-2 rounded-md px-2.5 py-0.5 text-[10px] text-gray-500 dark:text-gray-400 hover:bg-[var(--accent-light)] hover:text-[var(--accent)] transition-colors"
    >
      <span className="flex-1 border-t border-dashed border-gray-300 dark:border-gray-600 group-hover:border-[var(--accent)]" />
      <span className="tabular-nums">{t("today.untracked", { duration: formatDuration(gap.seconds) })}</span>
      <svg aria-hidden="true" className="h-2.5 w-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
      </svg>
      <span className="flex-1 border-t border-dashed border-gray-300 dark:border-gray-600 group-hover:border-[var(--accent)]" />
    </button>
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
  timelineEntries,
  onFillGap,
}: TodaySectionProps) {
  const { t } = useTranslation();
  const gapsByEntry = new Map(
    (onFillGap ? computeTodayGaps(entries) : []).map((gap) => [gap.beforeEntryId, gap]),
  );

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

      {timelineEntries && !isLoading && !isError && (
        <TodayTimelineBar entries={timelineEntries} colorMode={colorMode} />
      )}

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
            {entries.map((entry) => {
              const gap = gapsByEntry.get(entry.id);
              const gapRow = gap && onFillGap ? <GapRow gap={gap} onFill={onFillGap} /> : null;
              return (
                <Fragment key={entry.id}>
                  {sortAsc && gapRow}
                  <TodayEntryItem
                    entry={entry}
                    colorMode={colorMode}
                    onEdit={onEditEntry}
                    onRestart={onRestartEntry}
                    onToggleFavorite={onToggleFavoriteEntry}
                    isFavorite={isFavoriteEntry?.(entry)}
                    onDelete={onDeleteEntry}
                    onRunningContextMenu={onRunningEntryContextMenu}
                  />
                  {!sortAsc && gapRow}
                </Fragment>
              );
            })}
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
