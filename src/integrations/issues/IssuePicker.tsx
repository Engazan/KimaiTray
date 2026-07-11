import { useState, useRef, useEffect, useCallback, useMemo, useId } from "react";
import { useTranslation } from "react-i18next";
import type { ExternalIssue, IssueIntegrationSettings } from "./types";
import { useIssues } from "./useIssues";

interface IssuePickerProps {
  config: IssueIntegrationSettings;
  token: string;
  connectionId: string;
  selectedIssue: ExternalIssue | null;
  onSelectIssue: (issue: ExternalIssue | null) => void;
  disabled?: boolean;
  /** Name of the selected Kimai project — issues whose title contains it are
   *  highlighted as likely matches. */
  projectName?: string | null;
}

// Case- and diacritic-insensitive so "eshop.siklienka.sk" matches a title like
// "ANALYZA - eshop.siklienka.sk - Individuálne akcie".
function normalizeText(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

/** Format a duration in seconds to a compact "1h30m" / "5h" / "45m" string. */
function formatDuration(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (hours > 0) return minutes > 0 ? `${hours}h${minutes}m` : `${hours}h`;
  return `${minutes}m`;
}

/** Render the spent/estimate badge for an issue, or null when there's no estimate. */
function TimeEstimateBadge({ issue }: { issue: ExternalIssue }) {
  if (!issue.timeEstimate) return null;
  const spent = issue.timeSpent ?? 0;
  const overBudget = spent > issue.timeEstimate;
  return (
    <span
      className={`shrink-0 text-[10px] tabular-nums whitespace-nowrap ${
        overBudget
          ? "text-red-500 dark:text-red-400"
          : "text-gray-400 dark:text-gray-500"
      }`}
    >
      {formatDuration(spent)} / {formatDuration(issue.timeEstimate)}
    </span>
  );
}

export default function IssuePicker({
  config,
  token,
  connectionId,
  selectedIssue,
  onSelectIssue,
  disabled,
  projectName,
}: IssuePickerProps) {
  const { t } = useTranslation();
  const id = useId();
  const listId = `${id}-listbox`;
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [highlightIndex, setHighlightIndex] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const { issues, isLoading } = useIssues(
    config,
    token,
    search,
    connectionId,
  );

  // Issues whose title contains the selected project name — likely the one the
  // user wants, so we highlight them and pre-select the first match.
  const suggestedIds = useMemo(() => {
    const needle = projectName ? normalizeText(projectName.trim()) : "";
    if (needle.length < 2) return new Set<number>();
    return new Set(
      issues
        .filter((issue) => normalizeText(issue.title).includes(needle))
        .map((issue) => issue.id),
    );
  }, [issues, projectName]);

  useEffect(() => {
    const firstMatch = issues.findIndex((issue) => suggestedIds.has(issue.id));
    setHighlightIndex(firstMatch >= 0 ? firstMatch : 0);
  }, [issues, suggestedIds]);

  useEffect(() => {
    if (!open) return;
    const handle = (e: MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
        setSearch("");
      }
    };
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, [open]);

  useEffect(() => {
    if (open && inputRef.current) {
      inputRef.current.focus();
    }
  }, [open]);

  useEffect(() => {
    if (!open || !listRef.current) return;
    const el = listRef.current.children[highlightIndex] as
      | HTMLElement
      | undefined;
    el?.scrollIntoView({ block: "nearest" });
  }, [highlightIndex, open]);

  const select = useCallback(
    (issue: ExternalIssue) => {
      onSelectIssue(issue);
      setOpen(false);
      setSearch("");
    },
    [onSelectIssue],
  );

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlightIndex((i) => (i + 1) % (issues.length || 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlightIndex((i) =>
        (i - 1 + (issues.length || 1)) % (issues.length || 1),
      );
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (issues[highlightIndex]) select(issues[highlightIndex]);
    } else if (e.key === "Escape") {
      e.preventDefault();
      setOpen(false);
      setSearch("");
    }
  };

  const hasValue = selectedIssue != null;

  return (
    <div ref={containerRef} className="relative">
      <div className="flex items-center gap-1 min-w-0">
        <button
          type="button"
          onClick={() => {
            if (!disabled) setOpen(!open);
          }}
          disabled={disabled}
          aria-haspopup="listbox"
          aria-expanded={open}
          aria-controls={open ? listId : undefined}
          className="min-w-0 flex-1 rounded-lg border border-gray-300 dark:border-white/20 bg-white dark:bg-white/[0.08] px-3 py-2 text-[13px] text-left focus:border-[var(--accent)] focus:ring-1 focus:ring-[var(--accent)] focus:outline-none disabled:opacity-40 transition-colors flex items-center justify-between gap-1"
        >
          <span
            className={
              hasValue
                ? "text-gray-700 dark:text-gray-300 truncate"
                : "text-gray-400 dark:text-gray-500 truncate"
            }
          >
            {hasValue
              ? `#${selectedIssue.id} ${selectedIssue.title}`
              : t("integrations.issuePickerPlaceholder")}
          </span>
          {hasValue && config.showTimeEstimate && (
            <TimeEstimateBadge issue={selectedIssue} />
          )}
          <svg
            className={`h-3 w-3 shrink-0 text-gray-400 dark:text-gray-500 transition-transform ${open ? "rotate-180" : ""}`}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2.5}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M19.5 8.25l-7.5 7.5-7.5-7.5"
            />
          </svg>
        </button>

        {hasValue && !disabled && (
          <button
            type="button"
            onClick={() => onSelectIssue(null)}
            aria-label={t("common.delete")}
            className="shrink-0 rounded p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors focus:outline-none"
          >
            <svg
              className="h-3.5 w-3.5"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        )}
      </div>

      {open && (
        <div className="absolute z-50 mt-1 w-full rounded-lg border border-gray-200 dark:border-white/15 bg-white dark:bg-[#2a2a2e] shadow-lg overflow-hidden">
          <div className="p-1.5 border-b border-gray-100 dark:border-white/[0.06]">
            <input
              ref={inputRef}
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={handleKeyDown}
              role="combobox"
              aria-expanded={open}
              aria-controls={listId}
              aria-activedescendant={
                issues[highlightIndex]
                  ? `${id}-option-${highlightIndex}`
                  : undefined
              }
              placeholder={t("integrations.issuePickerPlaceholder")}
              className="w-full rounded-md bg-gray-50 dark:bg-white/[0.06] px-2.5 py-1.5 text-[12px] text-gray-700 dark:text-gray-300 placeholder:text-gray-400 dark:placeholder:text-gray-500 outline-none"
            />
          </div>
          <div
            ref={listRef}
            id={listId}
            role="listbox"
            aria-busy={isLoading}
            className="max-h-[180px] overflow-y-auto overscroll-contain py-0.5"
          >
            {isLoading ? (
              <div className="flex items-center justify-center gap-2 px-3 py-3">
                <div className="h-3 w-3 animate-spin rounded-full border-2 border-gray-300 dark:border-gray-600 border-t-[var(--accent)]" />
                <span className="text-[11px] text-gray-400 dark:text-gray-500">
                  {t("integrations.issuePickerLoading")}
                </span>
              </div>
            ) : issues.length === 0 ? (
              <div className="px-3 py-2 text-[11px] text-gray-400 dark:text-gray-500 text-center">
                {t("integrations.issuePickerNoResults")}
              </div>
            ) : (
              issues.map((issue, i) => {
                const suggested = suggestedIds.has(issue.id);
                return (
                <button
                  key={issue.id}
                  id={`${id}-option-${i}`}
                  role="option"
                  aria-selected={selectedIssue?.id === issue.id}
                  type="button"
                  onClick={() => select(issue)}
                  title={suggested ? t("integrations.issueSuggestedForProject") : undefined}
                  className={`w-full text-left px-3 py-1.5 text-[12px] transition-colors flex items-center gap-2 border-l-2 ${
                    suggested ? "border-[var(--accent)]" : "border-transparent"
                  } ${
                    highlightIndex === i
                      ? "bg-[var(--accent)]/10 text-[var(--accent)]"
                      : suggested
                        ? "bg-[var(--accent)]/[0.06] text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-white/[0.08]"
                        : "text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-white/[0.08]"
                  } ${selectedIssue?.id === issue.id ? "font-medium" : ""}`}
                >
                  <span
                    className={`h-1.5 w-1.5 shrink-0 rounded-full ${
                      issue.state === "opened" || issue.state === "open"
                        ? "bg-emerald-500"
                        : "bg-gray-400 dark:bg-gray-500"
                    }`}
                  />
                  <span className="shrink-0 text-[11px] text-gray-400 dark:text-gray-500 tabular-nums">
                    #{issue.id}
                  </span>
                  <span className="truncate flex-1 min-w-0">{issue.title}</span>
                  {config.showTimeEstimate && <TimeEstimateBadge issue={issue} />}
                </button>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}
