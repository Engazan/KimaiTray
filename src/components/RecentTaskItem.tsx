import { useState } from "react";
import { useTranslation } from "react-i18next";
import type { RecentTask, ColorMode } from "../types";
import TagsList from "./TagsList";
import ColorDots from "./ColorDots";

interface RecentTaskItemProps {
  task: RecentTask;
  onStart: (task: RecentTask) => void;
  onHide: (task: RecentTask) => void;
  onDelete: (task: RecentTask) => void;
  onToggleFavorite?: (task: RecentTask) => void;
  isFavorite?: boolean;
  isStarting?: boolean;
  isDeleting?: boolean;
  disabled?: boolean;
  colorMode?: ColorMode;
}

export default function RecentTaskItem({
  task,
  onStart,
  onHide,
  onDelete,
  onToggleFavorite,
  isFavorite,
  isStarting,
  isDeleting,
  disabled,
  colorMode = "kimai",
}: RecentTaskItemProps) {
  const { t } = useTranslation();
  const [confirming, setConfirming] = useState(false);

  const subtitle = [task.customer, task.description]
    .filter(Boolean)
    .join(" · ");

  return (
    <div className="relative">
    <div
      className={`group flex w-full items-center gap-2.5 rounded-md px-2.5 py-1.5
        text-left transition-colors
        hover:bg-gray-100 dark:hover:bg-white/[0.06]
        focus-within:bg-gray-100 dark:focus-within:bg-white/[0.06]
        ${confirming ? "invisible" : ""}`}
    >
      <button
        type="button"
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
        <span className="text-[10px] text-gray-400 dark:text-gray-500 group-hover:hidden">
          {task.lastUsed}
        </span>

        <div className="hidden group-hover:flex group-focus-within:flex items-center gap-0.5">
          {onToggleFavorite && (
            <button
              type="button"
              onClick={() => onToggleFavorite(task)}
              disabled={disabled}
              title={isFavorite ? t("favorites.removeFromFavorites") : t("favorites.addToFavorites")}
              aria-label={isFavorite ? t("favorites.removeFromFavorites") : t("favorites.addToFavorites")}
              className={`p-1 rounded transition-colors disabled:opacity-50 ${
                isFavorite
                  ? "text-amber-400 hover:text-amber-500"
                  : "text-gray-400 dark:text-gray-500 hover:text-amber-400 dark:hover:text-amber-400"
              }`}
            >
              <svg className="h-3 w-3" fill={isFavorite ? "currentColor" : "none"} viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
              </svg>
            </button>
          )}
          <button
            type="button"
            onClick={() => onHide(task)}
            disabled={disabled}
            title={t("recentActions.hideFromRecents")}
            aria-label={t("recentActions.hideFromRecents")}
            className="p-1 rounded text-gray-400 dark:text-gray-500 hover:text-[var(--accent)] dark:hover:text-[var(--accent)] transition-colors disabled:opacity-50"
          >
            <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3.98 8.223A10.477 10.477 0 001.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.45 10.45 0 0112 4.5c4.756 0 8.773 3.162 10.065 7.498a10.523 10.523 0 01-4.293 5.774M6.228 6.228L3 3m3.228 3.228l3.65 3.65m7.894 7.894L21 21m-3.228-3.228l-3.65-3.65m0 0a3 3 0 10-4.243-4.243m4.242 4.242L9.88 9.88" />
            </svg>
          </button>
          <button
            type="button"
            onClick={() => setConfirming(true)}
            disabled={disabled}
            title={t("recentActions.deleteFromKimai")}
            aria-label={t("recentActions.deleteFromKimai")}
            className="p-1 rounded text-gray-400 dark:text-gray-500 hover:text-red-500 dark:hover:text-red-400 transition-colors disabled:opacity-50"
          >
            <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
            </svg>
          </button>
        </div>

        {isStarting ? (
          <div className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-gray-200 border-t-[var(--accent)] dark:border-gray-600 dark:border-t-[var(--accent)]" />
        ) : (
          <button
            type="button"
            onClick={() => onStart(task)}
            disabled={disabled}
            title={t("common.start")}
            aria-label={t("common.start")}
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

      {confirming && (
        <div className="absolute inset-0 flex items-center gap-2 rounded-md px-2.5 bg-red-50 dark:bg-red-950/30 border border-red-200/60 dark:border-red-800/40">
          <span className="flex-1 text-[11px] text-red-600 dark:text-red-400">
            {t("recentActions.confirmDelete")}
          </span>
          <button
            type="button"
            onClick={() => {
              onDelete(task);
              setConfirming(false);
            }}
            disabled={isDeleting}
            className="text-[10px] font-medium text-red-600 dark:text-red-400 hover:text-red-800 dark:hover:text-red-300 disabled:opacity-50 transition-colors"
          >
            {isDeleting ? (
              <div className="h-3 w-3 animate-spin rounded-full border-2 border-red-400/30 border-t-red-500" />
            ) : (
              t("common.delete")
            )}
          </button>
          <button
            type="button"
            onClick={() => setConfirming(false)}
            className="text-[10px] font-medium text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 transition-colors"
          >
            {t("common.cancel")}
          </button>
        </div>
      )}
    </div>
  );
}
