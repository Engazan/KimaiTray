import { useState, useRef, useCallback, useEffect, useMemo, useId } from "react";
import { useTranslation } from "react-i18next";
import type { KimaiTag } from "../api/tagApi";
import TagPill from "./TagPill";

interface TagsInputProps {
  tags: string[];
  onChange: (tags: string[]) => void;
  onCommit?: () => void;
  disabled?: boolean;
  /** Existing tags to pick from (Kimai only attaches tags that exist). */
  suggestions?: KimaiTag[];
  /** "md" matches the form selects; "sm" is compact (default). */
  size?: "sm" | "md";
}

export default function TagsInput({
  tags,
  onChange,
  onCommit,
  disabled,
  suggestions = [],
  size = "sm",
}: TagsInputProps) {
  const { t } = useTranslation();
  const id = useId();
  const listId = `${id}-listbox`;
  const [input, setInput] = useState("");
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // Suggestions not yet selected, filtered by the current input.
  const available = useMemo(() => {
    const selected = new Set(tags.map((t) => t.toLowerCase()));
    const q = input.trim().toLowerCase();
    return suggestions.filter((s) => {
      const low = s.name.toLowerCase();
      if (selected.has(low)) return false;
      return q === "" || low.includes(q);
    });
  }, [suggestions, tags, input]);

  // Map tag name → color for coloring the selected pills.
  const colorByName = useMemo(() => {
    const m = new Map<string, string | null>();
    for (const s of suggestions) m.set(s.name.toLowerCase(), s.color);
    return m;
  }, [suggestions]);

  useEffect(() => {
    setHighlight(0);
  }, [available]);

  useEffect(() => {
    if (!open) return;
    const handle = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, [open]);

  useEffect(() => {
    if (!open || !listRef.current) return;
    const el = listRef.current.children[highlight] as HTMLElement | undefined;
    el?.scrollIntoView({ block: "nearest" });
  }, [highlight, open]);

  const addTag = useCallback(
    (name: string) => {
      const trimmed = name.trim();
      if (!trimmed) return;
      if (tags.some((tg) => tg.toLowerCase() === trimmed.toLowerCase())) return;
      onChange([...tags, trimmed]);
      setInput("");
    },
    [tags, onChange],
  );

  const removeTag = (index: number) => {
    onChange(tags.filter((_, i) => i !== index));
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      if (available.length === 0) return;
      e.preventDefault();
      setOpen(true);
      setHighlight((i) => (i + 1) % available.length);
    } else if (e.key === "ArrowUp") {
      if (available.length === 0) return;
      e.preventDefault();
      setOpen(true);
      setHighlight((i) => (i - 1 + available.length) % available.length);
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (open && available[highlight]) {
        addTag(available[highlight].name);
      } else if (input.trim() === "" && onCommit) {
        onCommit();
      }
    } else if (e.key === "Escape") {
      e.preventDefault();
      if (open) {
        setOpen(false);
      } else if (onCommit) {
        onCommit();
      }
    } else if (e.key === "Backspace" && input === "" && tags.length > 0) {
      e.preventDefault();
      onChange(tags.slice(0, -1));
    }
  };

  return (
    <div ref={containerRef} className="relative">
      <div
        onClick={() => {
          inputRef.current?.focus();
          setOpen(true);
        }}
        className={`flex flex-wrap items-center gap-1 rounded-lg border border-gray-200 dark:border-white/10 bg-white dark:bg-white/[0.06] cursor-text transition-colors focus-within:border-[var(--accent)] focus-within:ring-1 focus-within:ring-[var(--accent)] ${
          size === "md" ? "px-3 py-2 min-h-[38px]" : "px-2 py-1 min-h-[28px]"
        }`}
      >
        {tags.map((tag, i) => (
          <TagPill
            key={tag}
            tag={tag}
            color={colorByName.get(tag.toLowerCase()) ?? null}
            onRemove={disabled ? undefined : () => removeTag(i)}
          />
        ))}
        <input
          ref={inputRef}
          type="text"
          value={input}
          onChange={(e) => {
            setInput(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={handleKeyDown}
          disabled={disabled}
          role="combobox"
          aria-expanded={open && !disabled}
          aria-controls={listId}
          aria-activedescendant={
            available[highlight] ? `${id}-option-${highlight}` : undefined
          }
          placeholder={tags.length === 0 ? t("tags.placeholder") : ""}
          className={`flex-1 min-w-[60px] bg-transparent text-gray-700 dark:text-gray-300 placeholder:text-gray-300 dark:placeholder:text-gray-600 outline-none disabled:opacity-40 ${
            size === "md" ? "text-[13px]" : "text-xs"
          }`}
        />
      </div>

      {open && !disabled && (
        <div className="absolute z-50 mt-1 w-full rounded-lg border border-gray-200 dark:border-white/15 bg-white dark:bg-[#2a2a2e] shadow-lg overflow-hidden">
          <div
            ref={listRef}
            id={listId}
            role="listbox"
            className="max-h-[160px] overflow-y-auto overscroll-contain py-0.5"
          >
            {available.map((tag, i) => (
              <button
                key={tag.name}
                id={`${id}-option-${i}`}
                role="option"
                aria-selected={false}
                type="button"
                // Keep input focused so the click registers before blur.
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => addTag(tag.name)}
                className={`flex w-full items-center gap-2 text-left px-3 py-1.5 text-[12px] transition-colors ${
                  highlight === i
                    ? "bg-[var(--accent)]/10 text-[var(--accent)]"
                    : "text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-white/[0.08]"
                }`}
              >
                <span
                  className="h-2 w-2 rounded-full shrink-0"
                  style={{ backgroundColor: tag.color ?? "transparent" }}
                />
                <span className="truncate">{tag.name}</span>
              </button>
            ))}
            {available.length === 0 && (
              <div className="px-3 py-2 text-[11px] text-gray-400 dark:text-gray-500 text-center">
                {suggestions.length === 0
                  ? t("tags.noTags")
                  : t("tags.noMatch")}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
