import { useState, useRef, useEffect, useMemo, useCallback } from "react";

type OptionValue = string | number;

interface Option<T extends OptionValue> {
  value: T;
  label: string;
  /** Optional swatch shown as a leading dot (e.g. Kimai project/activity color). */
  color?: string | null;
}

/** Leading color swatch. Renders a faint ring placeholder to keep labels aligned
 *  when the option carries no color but its siblings do. */
function Dot({ color, placeholder }: { color?: string | null; placeholder?: boolean }) {
  if (!color && !placeholder) return null;
  return (
    <span
      className="h-2 w-2 shrink-0 rounded-full"
      style={
        color
          ? { backgroundColor: color }
          : { boxShadow: "inset 0 0 0 1px rgba(128,128,128,0.3)" }
      }
    />
  );
}

interface SearchableSelectProps<T extends OptionValue> {
  options: Option<T>[];
  value: T | null;
  onChange: (value: T | null) => void;
  placeholder: string;
  disabled?: boolean;
  allowEmpty?: boolean;
  emptyLabel?: string;
}

export default function SearchableSelect<T extends OptionValue>({
  options,
  value,
  onChange,
  placeholder,
  disabled,
  allowEmpty,
  emptyLabel,
}: SearchableSelectProps<T>) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [highlightIndex, setHighlightIndex] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const selected = useMemo(
    () => options.find((o) => o.value === value) ?? null,
    [options, value],
  );
  const selectedLabel = selected?.label ?? null;
  const hasColors = useMemo(
    () => options.some((o) => o.color != null),
    [options],
  );

  const filtered = useMemo(() => {
    if (!search) return options;
    const q = search.toLowerCase();
    return options.filter((o) => o.label.toLowerCase().includes(q));
  }, [options, search]);

  useEffect(() => {
    setHighlightIndex(0);
  }, [filtered]);

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
    const el = listRef.current.children[highlightIndex] as HTMLElement | undefined;
    el?.scrollIntoView({ block: "nearest" });
  }, [highlightIndex, open]);

  const select = useCallback(
    (val: T | null) => {
      onChange(val);
      setOpen(false);
      setSearch("");
    },
    [onChange],
  );

  const handleKeyDown = (e: React.KeyboardEvent) => {
    const totalItems = filtered.length + (allowEmpty ? 1 : 0);
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlightIndex((i) => (i + 1) % totalItems);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlightIndex((i) => (i - 1 + totalItems) % totalItems);
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (allowEmpty && highlightIndex === 0) {
        select(null);
      } else {
        const idx = allowEmpty ? highlightIndex - 1 : highlightIndex;
        if (filtered[idx]) select(filtered[idx].value);
      }
    } else if (e.key === "Escape") {
      e.preventDefault();
      setOpen(false);
      setSearch("");
    }
  };

  const displayText = selectedLabel ?? placeholder;
  const hasValue = value !== null;

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => {
          if (!disabled) setOpen(!open);
        }}
        disabled={disabled}
        className="w-full rounded-lg border border-gray-300 dark:border-white/20 bg-white dark:bg-white/[0.08] px-3 py-2 text-[13px] text-left focus:border-[var(--accent)] focus:ring-1 focus:ring-[var(--accent)] focus:outline-none disabled:opacity-40 transition-colors flex items-center justify-between gap-2"
      >
        <span className="flex items-center gap-2 min-w-0">
          {hasValue && selected?.color && <Dot color={selected.color} />}
          <span
            className={`truncate ${
              hasValue
                ? "text-gray-700 dark:text-gray-300"
                : "text-gray-400 dark:text-gray-500"
            }`}
          >
            {displayText}
          </span>
        </span>
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

      {open && (
        <div className="absolute z-50 mt-1 w-full rounded-lg border border-gray-200 dark:border-white/15 bg-white dark:bg-[#2a2a2e] shadow-lg overflow-hidden">
          <div className="p-1.5 border-b border-gray-100 dark:border-white/[0.06]">
            <input
              ref={inputRef}
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Search..."
              className="w-full rounded-md bg-gray-50 dark:bg-white/[0.06] px-2.5 py-1.5 text-[12px] text-gray-700 dark:text-gray-300 placeholder:text-gray-400 dark:placeholder:text-gray-500 outline-none"
            />
          </div>
          <div
            ref={listRef}
            className="max-h-[180px] overflow-y-auto overscroll-contain py-0.5"
          >
            {allowEmpty && (
              <button
                type="button"
                onClick={() => select(null)}
                className={`flex w-full items-center gap-2 text-left px-3 py-1.5 text-[12px] transition-colors ${
                  highlightIndex === 0
                    ? "bg-[var(--accent)]/10 text-[var(--accent)]"
                    : "text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-white/[0.08]"
                } ${value === null ? "font-medium" : ""}`}
              >
                {hasColors && <Dot placeholder />}
                <span className="truncate">{emptyLabel ?? "—"}</span>
              </button>
            )}
            {filtered.map((opt, i) => {
              const idx = allowEmpty ? i + 1 : i;
              return (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => select(opt.value)}
                  className={`flex w-full items-center gap-2 text-left px-3 py-1.5 text-[12px] transition-colors ${
                    highlightIndex === idx
                      ? "bg-[var(--accent)]/10 text-[var(--accent)]"
                      : "text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-white/[0.08]"
                  } ${opt.value === value ? "font-medium" : ""}`}
                >
                  {hasColors && <Dot color={opt.color} placeholder />}
                  <span className="truncate">{opt.label}</span>
                </button>
              );
            })}
            {filtered.length === 0 && (
              <div className="px-3 py-2 text-[11px] text-gray-400 dark:text-gray-500 text-center">
                No results
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
