import { useTranslation } from "react-i18next";
import type { FavoriteTask, ColorMode } from "../types";
import FavoriteTaskItem from "./FavoriteTaskItem";

interface FavoriteTasksListProps {
  tasks: FavoriteTask[];
  onStart: (task: FavoriteTask) => void;
  onRemove: (task: FavoriteTask) => void;
  onStartWithChanges?: (task: FavoriteTask) => void;
  startingKey?: string | null;
  disabled?: boolean;
  colorMode?: ColorMode;
}

export default function FavoriteTasksList({
  tasks,
  onStart,
  onRemove,
  onStartWithChanges,
  startingKey,
  disabled,
  colorMode = "kimai",
}: FavoriteTasksListProps) {
  const { t } = useTranslation();

  if (tasks.length === 0) return null;

  return (
    <div className="mt-1.5">
      <div className="px-3 py-1.5">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500">
          {t("favorites.title")}
        </span>
      </div>
      <div className="px-1.5 pb-1">
        {tasks.map((task) => (
          <FavoriteTaskItem
            key={task.key}
            task={task}
            onStart={onStart}
            onRemove={onRemove}
            onStartWithChanges={onStartWithChanges}
            isStarting={startingKey === task.key}
            disabled={disabled}
            colorMode={colorMode}
          />
        ))}
      </div>
      <div className="mx-3 mt-1 border-t border-gray-100 dark:border-gray-800" />
    </div>
  );
}
