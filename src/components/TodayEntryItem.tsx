import { useTranslation } from "react-i18next";
import type { TodayEntry, ColorMode } from "../types";
import TagsList from "./TagsList";
import ColorDots from "./ColorDots";
import { formatTime, formatDuration, parseKimaiDate } from "../utils/time";

interface TodayEntryItemProps {
  entry: TodayEntry;
  colorMode?: ColorMode;
  onEdit?: (entry: TodayEntry) => void;
}

export default function TodayEntryItem({
  entry,
  colorMode = "kimai",
  onEdit,
}: TodayEntryItemProps) {
  const { t } = useTranslation();

  const duration = entry.isRunning
    ? Math.max(0, Math.floor((Date.now() - parseKimaiDate(entry.beginIso).getTime()) / 1000))
    : (entry.duration ?? 0);

  const subtitle = [entry.customer, entry.description]
    .filter(Boolean)
    .join(" · ");

  const timeRange = (
    <span className="flex flex-col items-start whitespace-nowrap leading-tight">
      <span>{formatTime(entry.beginIso)}</span>
      {entry.isRunning ? (
        <span className="font-medium text-emerald-500 dark:text-emerald-400">
          {t("common.now")}
        </span>
      ) : entry.endIso ? (
        <span>{formatTime(entry.endIso)}</span>
      ) : (
        <span>—</span>
      )}
    </span>
  );

  return (
    <div
      className={`px-2.5 py-1.5 rounded-md transition-colors ${
        entry.isRunning
          ? "bg-emerald-50/50 dark:bg-emerald-950/20 border border-emerald-200/40 dark:border-emerald-800/30"
          : ""
      }`}
    >
      <div className="grid grid-cols-[max-content_auto_minmax(0,1fr)_auto] items-center gap-x-2">
        {/* Time range */}
        {!entry.isRunning && onEdit ? (
          <button
            type="button"
            onClick={() => onEdit(entry)}
            aria-label={t("today.editEntryLabel", { project: entry.project })}
            title={t("today.editEntry")}
            className="group inline-flex items-center rounded px-0.5 py-0.5 text-[10px] tabular-nums text-gray-400 transition-colors hover:bg-gray-100 hover:text-[var(--accent)] focus:outline-none focus-visible:bg-gray-100 focus-visible:text-[var(--accent)] focus-visible:ring-1 focus-visible:ring-[var(--accent)] dark:text-gray-500 dark:hover:bg-gray-800 dark:focus-visible:bg-gray-800"
          >
            {timeRange}
            <svg
              aria-hidden="true"
              className="ml-1 h-2.5 w-2.5 shrink-0 opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13l-2.685.8.8-2.685a4.5 4.5 0 011.13-1.897L16.862 4.487zM19.5 7.125L16.875 4.5"
              />
            </svg>
          </button>
        ) : (
          <div className="whitespace-nowrap px-0.5 text-[10px] tabular-nums text-gray-400 dark:text-gray-500">
            {timeRange}
          </div>
        )}

        {/* Color dot */}
        <ColorDots
          activityColor={entry.activityColor}
          projectColor={entry.projectColor}
          customerColor={entry.customerColor}
          colorMode={colorMode}
          size="sm"
          pulse={entry.isRunning}
        />

        {/* Project + Activity */}
        <div className="min-w-0">
          <div className="flex items-baseline gap-1">
            <span className="text-[11px] font-medium text-gray-700 dark:text-gray-300 truncate">
              {entry.project}
            </span>
            <span className="text-[10px] text-gray-400 dark:text-gray-500 truncate shrink-0">
              {entry.activity}
            </span>
          </div>
        </div>

        {/* Duration + billable */}
        <div className="flex items-center gap-1 shrink-0">
          {entry.billable && (
            <span className="text-[8px] text-emerald-500 dark:text-emerald-400 font-bold">$</span>
          )}
          <span
            className={`text-[10px] tabular-nums font-medium ${
              entry.isRunning
                ? "text-emerald-600 dark:text-emerald-400"
                : "text-gray-500 dark:text-gray-400"
            }`}
          >
            {formatDuration(duration)}
          </span>
        </div>

        {/* Subtitle row */}
        {(subtitle || entry.tags.length > 0) && (
          <div className="col-span-2 col-start-3 mt-0.5 flex min-w-0 items-center gap-2">
            {subtitle && (
              <span className="truncate text-[10px] text-gray-400 dark:text-gray-500">
                {subtitle}
              </span>
            )}
            {entry.tags.length > 0 && (
              <TagsList tags={entry.tags} maxVisible={2} />
            )}
          </div>
        )}
      </div>
    </div>
  );
}
