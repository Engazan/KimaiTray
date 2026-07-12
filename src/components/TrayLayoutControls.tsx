import type { ReactNode } from "react";

export type FocusTab = "recent" | "today";

interface FocusTabsProps {
  active: FocusTab;
  recentLabel: string;
  todayLabel: string;
  onChange: (tab: FocusTab) => void;
}

export function FocusTabs({ active, recentLabel, todayLabel, onChange }: FocusTabsProps) {
  return (
    <div className="sticky top-0 z-10 bg-white/95 py-1.5 backdrop-blur-sm dark:bg-[#1a1a1a]/95">
      <div className="mx-3 flex gap-1">
        {([
          ["recent", recentLabel],
          ["today", todayLabel],
        ] as const).map(([tab, label]) => (
          <button
            key={tab}
            onClick={() => onChange(tab)}
            className={`flex-1 rounded-md px-2 py-1 text-[10px] font-medium transition-colors focus:outline-none ${
              active === tab
                ? "bg-[var(--accent)]/10 text-[var(--accent)]"
                : "text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300"
            }`}
          >
            {label}
          </button>
        ))}
      </div>
    </div>
  );
}

interface CollapsibleTraySectionProps {
  title: string;
  detail?: ReactNode;
  collapsed: boolean;
  onToggle: () => void;
  children: ReactNode;
}

export function CollapsibleTraySection({
  title,
  detail,
  collapsed,
  onToggle,
  children,
}: CollapsibleTraySectionProps) {
  return (
    <div className="mt-1.5">
      <button
        onClick={onToggle}
        className="w-full px-3 py-1.5 flex items-center justify-between"
      >
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500">
            {title}
          </span>
          {detail}
        </div>
        <svg
          className={`h-3 w-3 text-gray-400 dark:text-gray-500 transition-transform ${collapsed ? "" : "rotate-180"}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {!collapsed && children}
    </div>
  );
}
