import { useEffect, useLayoutEffect, useRef, useState } from "react";

// A curated palette spanning the hue wheel plus a few neutrals, so users get
// pleasant choices without opening the OS picker. Tailwind-500-ish shades.
const DEFAULT_PRESETS = [
  "#ef4444", "#f97316", "#f59e0b", "#eab308", "#84cc16",
  "#22c55e", "#10b981", "#14b8a6", "#06b6d4", "#3b82f6",
  "#6366f1", "#8b5cf6", "#a855f7", "#ec4899", "#f43f5e",
  "#111827", "#64748b", "#9ca3af", "#d1d5db", "#ffffff",
];

/** Normalize loose hex input ("abc", "#AABBCC", "aabbcc") into "#aabbcc", or null. */
function normalizeHex(input: string): string | null {
  let s = input.trim().replace(/^#/, "").toLowerCase();
  if (/^[0-9a-f]{3}$/.test(s)) {
    s = s.split("").map((c) => c + c).join("");
  }
  return /^[0-9a-f]{6}$/.test(s) ? `#${s}` : null;
}

type Align = "start" | "center" | "end";

interface Props {
  value: string;
  onChange: (hex: string) => void;
  presets?: string[];
  align?: Align;
  ariaLabel?: string;
  children: React.ReactNode; // the trigger visual
}

export default function ColorPicker({
  value,
  onChange,
  presets = DEFAULT_PRESETS,
  align = "center",
  ariaLabel,
  children,
}: Props) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(value);
  const rootRef = useRef<HTMLDivElement>(null);
  const popRef = useRef<HTMLDivElement>(null);
  const [flip, setFlip] = useState(false);

  // Keep the hex field in sync whenever the popover (re)opens or the color changes.
  useEffect(() => {
    if (open) setDraft(value);
  }, [open, value]);

  // Close on outside click / Escape.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  // Flip the popover above the trigger if it would overflow the viewport bottom.
  useLayoutEffect(() => {
    if (!open || !popRef.current) return;
    const rect = popRef.current.getBoundingClientRect();
    setFlip(rect.bottom > window.innerHeight - 8);
  }, [open]);

  const alignCls =
    align === "start"
      ? "left-0"
      : align === "end"
        ? "right-0"
        : "left-1/2 -translate-x-1/2";

  const commit = (hex: string) => {
    onChange(hex);
    setDraft(hex);
  };

  const hexValid = normalizeHex(draft);

  return (
    <div className="relative" ref={rootRef}>
      <button
        type="button"
        aria-label={ariaLabel}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className={`w-full rounded-lg border transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 ${
          open
            ? "border-[var(--accent)]/40 ring-2 ring-[var(--accent)]/20"
            : "border-gray-200 hover:border-gray-300 dark:border-gray-700 dark:hover:border-gray-600"
        }`}
      >
        {children}
      </button>

      {open && (
        <div
          ref={popRef}
          role="dialog"
          className={`absolute z-50 w-56 rounded-xl border border-gray-200 bg-white p-3 shadow-xl dark:border-gray-700 dark:bg-gray-800 ${alignCls} ${
            flip ? "bottom-full mb-2" : "top-full mt-2"
          }`}
        >
          <div className="grid grid-cols-5 gap-1.5">
            {presets.map((c) => {
              const active = c.toLowerCase() === value.toLowerCase();
              return (
                <button
                  key={c}
                  type="button"
                  title={c}
                  onClick={() => commit(c)}
                  style={{ backgroundColor: c }}
                  className={`h-7 w-7 rounded-full border border-black/10 transition-transform dark:border-white/10 ${
                    active
                      ? "ring-2 ring-offset-2 ring-gray-500 dark:ring-gray-300 dark:ring-offset-gray-800 scale-110"
                      : "hover:scale-110"
                  }`}
                />
              );
            })}
          </div>

          <div className="mt-3 flex items-center gap-2">
            {/* Full-range custom color via the OS picker, shown as a swatch well. */}
            <label
              className="relative h-8 w-8 shrink-0 cursor-pointer overflow-hidden rounded-lg border border-gray-200 dark:border-gray-600"
              style={{ backgroundColor: value }}
              title={value}
            >
              <input
                type="color"
                value={value}
                onChange={(e) => commit(e.target.value)}
                className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
              />
            </label>

            <div className="relative flex-1">
              <span className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-[12px] text-gray-400">
                #
              </span>
              <input
                type="text"
                value={draft.replace(/^#/, "")}
                spellCheck={false}
                maxLength={7}
                onChange={(e) => {
                  setDraft(e.target.value);
                  const v = normalizeHex(e.target.value);
                  if (v) onChange(v);
                }}
                onBlur={() => setDraft(value)}
                className={`w-full rounded-lg border bg-transparent py-1 pl-5 pr-2 text-[12px] font-mono uppercase tracking-wide focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 ${
                  hexValid
                    ? "border-gray-200 dark:border-gray-600"
                    : "border-red-300 dark:border-red-700"
                }`}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
