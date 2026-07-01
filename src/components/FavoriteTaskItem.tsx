import { useTranslation } from "react-i18next";
import type { FavoriteTask, ColorMode } from "../types";
import TagsList from "./TagsList";
import ColorDots from "./ColorDots";

interface FavoriteTaskItemProps {
  task: FavoriteTask;
  onStart: (task: FavoriteTask) => void;
  onRemove: (task: FavoriteTask) => void;
  isStarting?: boolean;
  disabled?: boolean;
  colorMode?: ColorMode;
}

export default function FavoriteTaskItem({
  task,
  onStart,
  onRemove,
  isStarting,
  disabled,
  colorMode = "kimai",
}: FavoriteTaskItemProps) {
  const { t } = useTranslation();

  const subtitle = [task.customer, task.description]
    .filter(Boolean)
    .join(" · ");

  return (
    <div
      className="group flex w-full items-center gap-2.5 rounded-md px-2.5 py-1.5
        text-left transition-colors
        hover:bg-gray-100 dark:hover:bg-white/[0.06]
        focus-within:bg-gray-100 dark:focus-within:bg-white/[0.06]"
    >
      <button
        onClick={() => onStart(task)}
        disabled={disabled}
        className="flex items-center gap-2.5 flex-1 min-w-0
          focus:outline-none focus-visible:ring-1 focus-visible:ring-[var(--accent)] rounded
          disabled:opacity-50 disabled:cursor-not-allowed"
      >
        <ColorDots
          activityColor={task.activityColor}
          projectColor={task.projectColor}
          customerColor={task.customerColor}
          colorMode={colorMode}
        />

        <div className="flex-1 min-w-0 text-left">
          <div className="flex items-baseline gap-1.5">
            <span className="text-xs font-medium text-gray-700 dark:text-gray-300 truncate">
              {task.project}
            </span>
            <span className="text-[10px] text-gray-400 dark:text-gray-500 shrink-0">
              {task.activity}
            </span>
          </div>
          {subtitle && (
            <p className="text-[10px] text-gray-400 dark:text-gray-500 truncate">
              {subtitle}
            </p>
          )}
          {task.tags.length > 0 && (
            <div className="mt-0.5">
              <TagsList tags={task.tags} maxVisible={2} />
            </div>
          )}
        </div>
      </button>

      <div className="flex items-center gap-1.5 shrink-0">
        <svg
          className="h-3 w-3 text-amber-400 group-hover:hidden"
          fill="currentColor"
          viewBox="0 0 24 24"
        >
          <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
        </svg>

        <div className="hidden group-hover:flex items-center gap-0.5">
          <button
            onClick={() => onRemove(task)}
            disabled={disabled}
            title={t("favorites.removeFromFavorites")}
            className="p-1 rounded text-amber-400 hover:text-red-500 dark:hover:text-red-400 transition-colors disabled:opacity-50"
          >
            <svg className="h-3 w-3" fill="currentColor" viewBox="0 0 24 24">
              <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
            </svg>
          </button>
        </div>

        {isStarting ? (
          <div className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-gray-200 border-t-[var(--accent)] dark:border-gray-600 dark:border-t-[var(--accent)]" />
        ) : (
          <button
            onClick={() => onStart(task)}
            disabled={disabled}
            className="p-0.5 rounded text-gray-400 dark:text-gray-500
              group-hover:text-[var(--accent)]
              transition-colors disabled:opacity-50"
          >
            <svg
              className="h-3.5 w-3.5"
              fill="currentColor"
              viewBox="0 0 24 24"
            >
              <path d="M8 5v14l11-7z" />
            </svg>
          </button>
        )}
      </div>
    </div>
  );
}
