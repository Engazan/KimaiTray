import { CategoryPictogram, categoryColorValue, type CategoryColor, type CategoryIcon } from "./CategoryVisual";

interface CategoryButtonProps {
  label: string;
  /** Secondary line: mapped activity name, or a warning message. */
  sublabel?: string;
  onClick: () => void;
  disabled?: boolean;
  isStarting?: boolean;
  /** Show a right chevron (drill-down into subcategories) instead of a play icon. */
  drilldown?: boolean;
  /** Warning state (e.g. activity not found / default project not set). */
  warning?: boolean;
  icon?: CategoryIcon;
  color?: CategoryColor;
}

// Full-width button matching the FavoriteTaskItem row look, used for both main
// categories (drilldown) and leaf subcategories (start / project step).
export default function CategoryButton({
  label,
  sublabel,
  onClick,
  disabled,
  isStarting,
  drilldown,
  warning,
  icon,
  color,
}: CategoryButtonProps) {
  const accent = categoryColorValue(color);

  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="group flex w-full items-center gap-2.5 rounded-md px-2.5 py-2
        text-left transition-colors
        hover:bg-gray-100 dark:hover:bg-white/[0.06]
        focus:outline-none focus-visible:ring-1 focus-visible:ring-[var(--accent)]
        disabled:opacity-50 disabled:cursor-not-allowed"
    >
      {icon && (
        <span
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md"
          style={accent ? { color: accent, backgroundColor: `${accent}18` } : undefined}
        >
          <CategoryPictogram icon={icon} className="h-4 w-4" />
        </span>
      )}
      {!icon && accent && (
        <span
          className="ml-1 h-2 w-2 shrink-0 rounded-full"
          style={{ backgroundColor: accent }}
        />
      )}
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline gap-1.5">
          <span className="text-[13px] font-medium text-gray-700 dark:text-gray-200 truncate">
            {label}
          </span>
        </div>
        {sublabel && (
          <p
            className={`text-[10px] truncate ${
              warning
                ? "text-red-500 dark:text-red-400"
                : "text-gray-400 dark:text-gray-500"
            }`}
          >
            {sublabel}
          </p>
        )}
      </div>

      <div className="shrink-0 flex items-center">
        {isStarting ? (
          <div className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-gray-200 border-t-[var(--accent)] dark:border-gray-600 dark:border-t-[var(--accent)]" />
        ) : warning ? (
          <svg className="h-4 w-4 text-red-400 dark:text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
          </svg>
        ) : drilldown ? (
          <svg className="h-4 w-4 text-gray-300 dark:text-gray-600 group-hover:text-gray-400 dark:group-hover:text-gray-500 transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
          </svg>
        ) : (
          <svg className="h-3.5 w-3.5 text-gray-400 dark:text-gray-500 group-hover:text-[var(--accent)] transition-colors" fill="currentColor" viewBox="0 0 24 24">
            <path d="M8 5v14l11-7z" />
          </svg>
        )}
      </div>
    </button>
  );
}
