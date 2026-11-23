import {
  createContext,
  useContext,
  useEffect,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import { useTranslation } from "react-i18next";

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
 * cards. Rows and cards carry `data-settings-item` so the settings search can
 * filter them, and groups carry `data-settings-group` so empty ones hide.
 */

/* ── Autosave indicator ─────────────────────────────────────────── */

/** Timestamp of the last settings write; 0 when nothing changed yet. */
export const SettingsSavedContext = createContext(0);

function SavedIndicator() {
  const { t } = useTranslation();
  const savedAt = useContext(SettingsSavedContext);
  const [flash, setFlash] = useState(false);

  useEffect(() => {
    if (!savedAt) return;
    setFlash(true);
    const id = window.setTimeout(() => setFlash(false), 1400);
    return () => window.clearTimeout(id);
  }, [savedAt]);

  return (
    <div
      aria-live="polite"
      className={`flex shrink-0 items-center gap-1.5 whitespace-nowrap pt-1.5 text-[11px] transition-colors ${
        flash ? "text-emerald-600 dark:text-emerald-400" : "text-[var(--s-fg-subtle)]"
      }`}
    >
      <span className="h-1.5 w-1.5 rounded-full bg-current" />
      {flash ? t("settings.saved") : t("settings.autosave")}
    </div>
  );
}

/* ── Shared atoms ───────────────────────────────────────────────── */

export const CARD =
  "rounded-xl border border-[var(--s-line)] bg-[var(--s-card)] shadow-[var(--s-shadow)]";

export function Badge({
  children,
  tone = "neutral",
}: {
  children: ReactNode;
  tone?: "neutral" | "accent";
}) {
  return (
    <span
      className={`rounded-[5px] px-1.5 py-[2px] text-[9.5px] font-semibold uppercase tracking-[0.04em] ${
        tone === "accent"
          ? "bg-[var(--accent-soft)] text-[var(--accent)]"
          : "bg-[var(--s-line-soft)] text-[var(--s-fg-subtle)]"
      }`}
    >
      {children}
    </span>
  );
}

export function SettingsWarning({ children }: { children: ReactNode }) {
  return (
    <div className="flex items-start gap-2 rounded-lg border border-amber-300/50 bg-amber-50 px-3 py-2 text-[11.5px] leading-[1.45] text-amber-700 dark:border-amber-700/40 dark:bg-amber-950/30 dark:text-amber-400">
      <svg className="mt-px h-3.5 w-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
      </svg>
      <span>{children}</span>
    </div>
  );
}

export function SettingsNote({ children }: { children: ReactNode }) {
  return (
    <p data-settings-note className="px-1 text-[11.5px] leading-[1.5] text-[var(--s-fg-subtle)]">
      {children}
    </p>
  );
}

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
        <h3 className="text-[10.5px] font-semibold uppercase tracking-[0.08em] text-[var(--s-fg-subtle)]">
          {title}
        </h3>
      )}
      {description && (
        <p className="mt-0.5 text-[11.5px] leading-[1.45] text-[var(--s-fg-subtle)]">
          {description}
        </p>
      )}
    </div>
  );
}

/* ── Page & groups ──────────────────────────────────────────────── */

export function SettingsPage({
  title,
  description,
  children,
  titleAddon,
}: {
  title: string;
  description?: ReactNode;
  children: ReactNode;
  /** Extra content rendered next to the title (status pills, actions…). */
  titleAddon?: ReactNode;
}) {
  return (
    <div className="space-y-[22px]" data-settings-page>
      <header className="flex items-start justify-between gap-4" data-settings-page-header>
        <div className="min-w-0">
          <h2 className="flex flex-wrap items-center gap-2.5 text-[21px] font-semibold tracking-[-0.015em] text-[var(--s-fg)] [text-wrap:balance]">
            {title}
            {titleAddon}
          </h2>
          {description && (
            <p className="mt-1.5 max-w-[56ch] text-[12.5px] leading-[1.5] text-[var(--s-fg-muted)]">
              {description}
            </p>
          )}
        </div>
        <SavedIndicator />
      </header>
      {children}
    </div>
  );
}

export function SettingsList({
  title,
  description,
  children,
  allowOverflow = false,
}: {
  title?: string;
  description?: string;
  children: ReactNode;
  /** Allow popovers such as searchable selects to extend beyond the card. */
  allowOverflow?: boolean;
}) {
  return (
    <section data-settings-group>
      <GroupHeader title={title} description={description} />
      <div
        className={`${allowOverflow ? "overflow-visible" : "overflow-hidden"} divide-y divide-[var(--s-line-soft)] ${CARD}`}
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
    <section data-settings-group>
      <GroupHeader title={title} description={description} />
      <div
        data-settings-item
        data-settings-search={`${title ?? ""} ${description ?? ""}`}
        className={`p-4 ${CARD} ${className}`}
      >
        {children}
      </div>
    </section>
  );
}

/* ── Rows ───────────────────────────────────────────────────────── */

function RowLabel({
  label,
  description,
  badge,
  dimmed,
}: {
  label: ReactNode;
  description?: ReactNode;
  badge?: ReactNode;
  dimmed?: boolean;
}) {
  return (
    <div className={`min-w-0 ${dimmed ? "opacity-50" : ""}`}>
      <div className="flex flex-wrap items-center gap-[7px] text-[13px] font-medium text-[var(--s-fg)]">
        {label}
        {badge}
      </div>
      {description && (
        <div className="mt-0.5 max-w-[52ch] text-[11.5px] leading-[1.45] text-[var(--s-fg-subtle)]">
          {description}
        </div>
      )}
    </div>
  );
}

export function SettingsRow({
  label,
  description,
  children,
  inset = false,
  badge,
  dimmed = false,
}: {
  label: ReactNode;
  description?: ReactNode;
  children: ReactNode;
  /** Drop the row's own padding — for use inside an already-padded SettingsCard. */
  inset?: boolean;
  /** Small tag rendered next to the label (platform, "new"…). */
  badge?: ReactNode;
  /** Visually mute the label when the control is disabled. */
  dimmed?: boolean;
}) {
  return (
    <div
      data-settings-item
      className={`flex items-center justify-between gap-[18px] ${inset ? "" : "min-h-[52px] px-4 py-3"}`}
    >
      <RowLabel label={label} description={description} badge={badge} dimmed={dimmed} />
      <div className="flex shrink-0 items-center gap-2">{children}</div>
    </div>
  );
}

export function SettingsRowStacked({
  label,
  description,
  children,
  badge,
  dimmed = false,
}: {
  label: ReactNode;
  description?: ReactNode;
  children: ReactNode;
  badge?: ReactNode;
  dimmed?: boolean;
}) {
  return (
    <div data-settings-item className="px-4 py-3">
      <RowLabel label={label} description={description} badge={badge} dimmed={dimmed} />
      <div className="mt-2.5">{children}</div>
    </div>
  );
}

/* ── Option cards ───────────────────────────────────────────────── */

/** The circular selected/unselected indicator used across option cards. */
export function RadioDot({
  active,
  size = "md",
}: {
  active: boolean;
  size?: "sm" | "md";
}) {
  const outer = size === "sm" ? "h-3 w-3" : "h-3.5 w-3.5";
  const inner = size === "sm" ? "h-1.5 w-1.5" : "h-[7px] w-[7px]";
  return (
    <span
      className={`inline-flex shrink-0 items-center justify-center rounded-full border-[1.5px] ${outer} ${
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
      aria-pressed={active}
      className={`rounded-[10px] border bg-[var(--s-card)] transition-[border-color,box-shadow]
        focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]
        disabled:cursor-not-allowed disabled:opacity-50 ${
          active
            ? "border-[var(--accent)] shadow-[0_0_0_3px_var(--accent-soft)]"
            : "border-[var(--s-line)] hover:border-gray-300 dark:hover:border-gray-600"
        } ${className}`}
    >
      {children}
    </button>
  );
}
