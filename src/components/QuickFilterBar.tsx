import { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";

interface QuickFilterBarProps {
  query: string;
  onChange: (query: string) => void;
  /** Moves focus from the input to the first matching row. */
  onFocusResults: () => void;
  /** Starts the first matching task. */
  onSubmit: () => void;
  isEmpty: boolean;
}

export default function QuickFilterBar({
  query,
  onChange,
  onFocusResults,
  onSubmit,
  isEmpty,
}: QuickFilterBarProps) {
  const { t } = useTranslation();
  const inputRef = useRef<HTMLInputElement>(null);

  // The bar mounts when typing starts; keep typing in the input.
  useEffect(() => {
    const input = inputRef.current!;
    input.focus();
    input.setSelectionRange(input.value.length, input.value.length);
  }, []);

  return (
    <div className="mx-3 mt-2">
      <div className="flex items-center gap-2 rounded-md border border-[var(--accent)]/40 bg-[var(--accent-light)] px-2 py-1">
        <svg aria-hidden="true" className="h-3 w-3 shrink-0 text-[var(--accent)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
        </svg>
        <input
          ref={inputRef}
          type="search"
          value={query}
          aria-label={t("tray.filterLabel")}
          placeholder={t("tray.filterPlaceholder")}
          onChange={(event) => onChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              event.preventDefault();
              event.stopPropagation();
              onChange("");
            } else if (event.key === "ArrowDown") {
              event.preventDefault();
              onFocusResults();
            } else if (event.key === "Enter") {
              event.preventDefault();
              onSubmit();
            }
          }}
          className="min-w-0 flex-1 bg-transparent text-[12px] text-gray-800 placeholder:text-gray-500 focus:outline-none dark:text-gray-100 dark:placeholder:text-gray-400 [&::-webkit-search-cancel-button]:hidden"
        />
        <button
          type="button"
          onClick={() => onChange("")}
          title={t("tray.clearFilter")}
          aria-label={t("tray.clearFilter")}
          className="focus-ring shrink-0 rounded p-0.5 text-gray-500 hover:text-gray-800 dark:text-gray-400 dark:hover:text-gray-100"
        >
          <svg aria-hidden="true" className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
      {isEmpty && (
        <p role="status" className="px-1 pt-2 text-center text-[11px] text-gray-500 dark:text-gray-400">
          {t("tray.noFilterResults")}
        </p>
      )}
    </div>
  );
}
