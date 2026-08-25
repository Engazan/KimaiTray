import { useTranslation } from "react-i18next";
import type { MouseEventHandler } from "react";
import type { RecentTask, ColorMode } from "../types";
import RecentTaskItem from "./RecentTaskItem";

interface RecentTasksListProps {
  tasks: RecentTask[];
  onStart: (task: RecentTask) => void;
  onHide: (task: RecentTask) => void;
  onDelete: (task: RecentTask) => void;
  onToggleFavorite?: (task: RecentTask) => void;
  onStartWithChanges?: (task: RecentTask) => void;
  onEditLastEntry?: (task: RecentTask) => void;
  onHeaderContextMenu?: MouseEventHandler<HTMLDivElement>;
  isFavorite?: (key: string) => boolean;
  isLoading?: boolean;
  startingKey?: string | null;
  deletingId?: number | null;
  disabled?: boolean;
  hiddenCount?: number;
  onShowAll?: () => void;
  showHeader?: boolean;
  colorMode?: ColorMode;
}

function LoadingSkeleton() {
  return (
    <div className="px-2.5 py-1.5 flex items-center gap-2.5 animate-pulse">
      <span className="inline-block h-2 w-2 shrink-0 rounded-full bg-gray-200 dark:bg-gray-700" />
      <div className="flex-1 space-y-1">
        <div className="h-3 w-24 rounded bg-gray-200 dark:bg-gray-700" />
        <div className="h-2 w-16 rounded bg-gray-100 dark:bg-gray-800" />
      </div>
    </div>
  );
}

export default function RecentTasksList({
  tasks,
  onStart,
  onHide,
  onDelete,
  onToggleFavorite,
  onStartWithChanges,
  onEditLastEntry,
  onHeaderContextMenu,
  isFavorite,
  isLoading,
  startingKey,
  deletingId,
  disabled,
  hiddenCount = 0,
  onShowAll,
  showHeader = true,
  colorMode = "kimai",
}: RecentTasksListProps) {
  const { t } = useTranslation();

  if (isLoading) {
    return (
      <div className={showHeader ? "mt-1.5" : ""}>
        {showHeader && (
          <div className="px-3 py-1.5" onContextMenu={onHeaderContextMenu}>
            <span className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500">
              {t("tray.recentTasks")}
            </span>
          </div>
        )}
        <div className="px-1.5 pb-1">
          <LoadingSkeleton />
          <LoadingSkeleton />
          <LoadingSkeleton />
        </div>
      </div>
    );
  }

  if (tasks.length === 0 && hiddenCount === 0) return null;

  return (
    <div className={showHeader ? "mt-1.5" : ""}>
      {showHeader && (
        <div className="px-3 py-1.5 flex items-center justify-between" onContextMenu={onHeaderContextMenu}>
          <span className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500">
            {t("tray.recentTasks")}
          </span>
          {hiddenCount > 0 && onShowAll && (
            <button
              onClick={onShowAll}
              className="text-[9px] text-gray-400 dark:text-gray-500 hover:text-[var(--accent)] transition-colors"
            >
              {t("recentActions.hiddenCount", { count: hiddenCount })} · {t("recentActions.showAll")}
            </button>
          )}
        </div>
      )}
      {!showHeader && hiddenCount > 0 && onShowAll && (
        <div className="px-3 pb-1 flex justify-end">
          <button
            onClick={onShowAll}
            className="text-[9px] text-gray-400 dark:text-gray-500 hover:text-[var(--accent)] transition-colors"
          >
            {t("recentActions.hiddenCount", { count: hiddenCount })} · {t("recentActions.showAll")}
          </button>
        </div>
      )}
      <div className="px-1.5 pb-1">
        {tasks.map((task) => (
          <RecentTaskItem
            key={task.key}
            task={task}
            onStart={onStart}
            onHide={onHide}
            onDelete={onDelete}
            onToggleFavorite={onToggleFavorite}
            onStartWithChanges={onStartWithChanges}
            onEditLastEntry={onEditLastEntry}
            isFavorite={isFavorite?.(task.key)}
            isStarting={startingKey === task.key}
            isDeleting={deletingId === task.timesheetId}
            disabled={disabled}
            colorMode={colorMode}
          />
        ))}
      </div>
    </div>
  );
}
