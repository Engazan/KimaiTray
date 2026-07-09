import type { CSSProperties, ReactNode } from "react";

/**
 * Card-based settings layout primitives shared by every settings section.
 *
 *  SettingsPage   — section shell: a title + description header, then groups.
 *  SettingsList   — a card of stacked rows separated by hairline dividers.
 *  SettingsCard   — a padded card for free-form content (grids, pickers…).
 *  SettingsRow    — one row: label/description on the left, control on the right.
 *  SettingsRowStacked — a row whose control sits full-width beneath the label.
 *
 * Both SettingsList and SettingsCard accept an optional group `title` /
 * `description`, which lets a single section be split into logically grouped
 * cards.
 */

function GroupHeader({
  title,
  description,
}: {
  title?: string;
  description?: string;
}) {
  if (!title && !description) return null;
  return (
    <div className="mb-2 px-1">
      {title && (
        <h3 className="text-[11px] font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500">
          {title}
        </h3>
      )}
      {description && (
        <p className="mt-0.5 text-[11px] leading-4 text-gray-400 dark:text-gray-500">
          {description}
        </p>
      )}
    </div>
  );
}

const CARD =
  "rounded-xl border border-gray-200 bg-white shadow-sm shadow-gray-200/40 dark:border-gray-800 dark:bg-[#181818] dark:shadow-black/10";

export function SettingsPage({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <div className="space-y-5">
      <header>
        <h2 className="text-[17px] font-semibold text-gray-800 dark:text-gray-100">
          {title}
        </h2>
        {description && (
          <p className="mt-1 text-[12.5px] leading-5 text-gray-500 dark:text-gray-400">
            {description}
          </p>
        )}
      </header>
      {children}
    </div>
  );
}

export function SettingsList({
  title,
  description,
  children,
}: {
  title?: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <section>
      <GroupHeader title={title} description={description} />
      <div
        className={`overflow-hidden divide-y divide-gray-100 dark:divide-gray-800 ${CARD}`}
      >
        {children}
      </div>
    </section>
  );
}

export function SettingsCard({
  title,
  description,
  children,
  className = "",
}: {
  title?: string;
  description?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section>
      <GroupHeader title={title} description={description} />
      <div className={`p-4 ${CARD} ${className}`}>{children}</div>
    </section>
  );
}

export function SettingsRow({
  label,
  description,
  children,
  inset = false,
}: {
  label: ReactNode;
  description?: ReactNode;
  children: ReactNode;
  /** Drop the row's own padding — for use inside an already-padded SettingsCard. */
  inset?: boolean;
}) {
  return (
    <div
      className={`flex items-center justify-between gap-4 ${inset ? "" : "px-4 py-3"}`}
    >
      <div className="min-w-0">
        <div className="text-[13px] font-medium text-gray-700 dark:text-gray-200">
          {label}
        </div>
        {description && (
          <div className="mt-0.5 text-[11px] leading-4 text-gray-400 dark:text-gray-500">
            {description}
          </div>
        )}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}

/** The circular selected/unselected indicator used across option cards. */
export function RadioDot({
  active,
  size = "md",
}: {
  active: boolean;
  size?: "sm" | "md";
}) {
  const outer = size === "sm" ? "h-3 w-3" : "h-3.5 w-3.5";
  const inner = size === "sm" ? "h-1.5 w-1.5" : "h-2 w-2";
  return (
    <span
      className={`inline-flex shrink-0 items-center justify-center rounded-full border ${outer} ${
        active
          ? "border-[var(--accent)]"
          : "border-gray-300 dark:border-gray-600"
      }`}
    >
      {active && (
        <span className={`rounded-full bg-[var(--accent)] ${inner}`} />
      )}
    </span>
  );
}

/**
 * A selectable option card (radio-like). Owns the shared border / active /
 * hover / focus treatment; callers pass layout & padding via `className`.
 */
export function SelectableCard({
  active,
  onClick,
  disabled,
  title,
  className = "",
  style,
  children,
}: {
  active: boolean;
  onClick: () => void;
  disabled?: boolean;
  title?: string;
  className?: string;
  style?: CSSProperties;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      style={style}
      className={`rounded-lg border transition-colors
        focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]
        disabled:cursor-not-allowed ${
          active
            ? "border-[var(--accent)] bg-[var(--accent-light)]"
            : "border-gray-200 hover:border-gray-300 dark:border-gray-700 dark:hover:border-gray-600"
        } ${className}`}
    >
      {children}
    </button>
  );
}

export function SettingsRowStacked({
  label,
  description,
  children,
}: {
  label: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <div className="px-4 py-3">
      <div className="text-[13px] font-medium text-gray-700 dark:text-gray-200">
        {label}
      </div>
      {description && (
        <div className="mt-0.5 text-[11px] leading-4 text-gray-400 dark:text-gray-500">
          {description}
        </div>
      )}
      <div className="mt-2.5">{children}</div>
    </div>
  );
}
