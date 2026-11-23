import { useEffect, useRef, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { currentPlatform } from "../platform";

/* ── Field wrapper ──────────────────────────────────────────────── */

interface FieldGroupProps {
  label: string;
  description?: string;
  children: ReactNode;
  horizontal?: boolean;
}

export function FieldGroup({
  label,
  description,
  children,
  horizontal = false,
}: FieldGroupProps) {
  if (horizontal) {
    return (
      <div className="flex items-center justify-between gap-4 py-2">
        <div className="min-w-0">
          <div className="text-[13px] font-medium text-[var(--s-fg)]">
            {label}
          </div>
          {description && (
            <div className="text-[11px] text-[var(--s-fg-subtle)]">
              {description}
            </div>
          )}
        </div>
        <div className="shrink-0" role="group" aria-label={label}>
          {children}
        </div>
      </div>
    );
  }
  return (
    <div className="py-2">
      <div className="mb-1.5 text-[13px] font-medium text-[var(--s-fg)]">
        {label}
      </div>
      {description && (
        <div className="mb-2 text-[11px] text-[var(--s-fg-subtle)]">
          {description}
        </div>
      )}
      <div role="group" aria-label={label}>
        {children}
      </div>
    </div>
  );
}

/* ── Section header ─────────────────────────────────────────────── */

export function SectionTitle({ children }: { children: ReactNode }) {
  return (
    <h2 className="mb-4 text-[15px] font-semibold text-[var(--s-fg)]">
      {children}
    </h2>
  );
}

export function SectionDescription({ children }: { children: ReactNode }) {
  return (
    <p className="mb-4 text-[12px] text-[var(--s-fg-subtle)]">
      {children}
    </p>
  );
}

export function Divider() {
  return <div className="my-3 border-t border-[var(--s-line-soft)]" />;
}

/* ── Shared control styles ──────────────────────────────────────── */

const FIELD =
  "h-[31px] rounded-lg border border-[var(--s-line)] bg-[var(--s-card)] text-[12.5px] text-[var(--s-fg)] " +
  "placeholder:text-[var(--s-fg-subtle)] outline-none transition-[border-color,box-shadow] " +
  "focus:border-[var(--accent)] focus:shadow-[0_0_0_3px_var(--accent-soft)] " +
  "disabled:cursor-not-allowed disabled:opacity-45";

/* ── Toggle ─────────────────────────────────────────────────────── */

interface ToggleProps {
  checked: boolean;
  onChange: (value: boolean) => void;
  disabled?: boolean;
  ariaLabel?: string;
}

export function Toggle({ checked, onChange, disabled, ariaLabel }: ToggleProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-label={ariaLabel}
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-[21px] w-9 shrink-0 items-center rounded-full transition-colors
        focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-2
        focus-visible:ring-offset-[var(--s-card)]
        ${checked ? "bg-[var(--accent)]" : "bg-gray-300/80 dark:bg-white/15"}
        ${disabled ? "opacity-40 cursor-not-allowed" : "cursor-pointer"}`}
    >
      <span
        className={`inline-block h-4 w-4 rounded-full bg-white shadow-[0_1px_3px_rgba(0,0,0,0.25)] transition-transform
          ${checked ? "translate-x-[17.5px]" : "translate-x-[2.5px]"}`}
      />
    </button>
  );
}

/* ── Text input ─────────────────────────────────────────────────── */

interface TextInputProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  type?: "text" | "url" | "password";
  disabled?: boolean;
  /** Render in the monospace face (URLs, tokens, technical ids). */
  mono?: boolean;
}

export function TextInput({
  value,
  onChange,
  placeholder,
  type = "text",
  disabled,
  mono = false,
}: TextInputProps) {
  return (
    <input
      type={type}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      disabled={disabled}
      spellCheck={false}
      className={`${FIELD} w-full px-2.5 ${mono ? "font-mono text-[12px]" : ""}`}
    />
  );
}

/* ── Number input ───────────────────────────────────────────────── */

interface NumberInputProps {
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
  suffix?: string;
  disabled?: boolean;
}

export function NumberInput({
  value,
  onChange,
  min,
  max,
  step = 1,
  suffix,
  disabled,
}: NumberInputProps) {
  const clamp = (v: number) =>
    Math.min(max ?? Number.POSITIVE_INFINITY, Math.max(min ?? Number.NEGATIVE_INFINITY, v));
  const stepBtn =
    "flex h-full w-[26px] items-center justify-center text-[15px] text-[var(--s-fg-muted)] " +
    "hover:bg-[var(--s-hover)] disabled:cursor-not-allowed disabled:hover:bg-transparent focus:outline-none " +
    "focus-visible:bg-[var(--s-hover)]";
  return (
    <div
      className={`inline-flex h-[31px] items-center overflow-hidden rounded-lg border border-[var(--s-line)] bg-[var(--s-card)]
        focus-within:border-[var(--accent)] focus-within:shadow-[0_0_0_3px_var(--accent-soft)] ${disabled ? "opacity-45" : ""}`}
    >
      <button
        type="button"
        tabIndex={-1}
        aria-hidden="true"
        disabled={disabled || (min !== undefined && value <= min)}
        onClick={() => onChange(clamp(value - step))}
        className={stepBtn}
      >
        −
      </button>
      <input
        type="number"
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        min={min}
        max={max}
        step={step}
        disabled={disabled}
        className="w-11 bg-transparent text-center font-mono text-[12.5px] tabular-nums text-[var(--s-fg)] outline-none
          [-moz-appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none
          disabled:cursor-not-allowed"
      />
      {suffix && (
        <span className="pr-1 text-[11px] text-[var(--s-fg-subtle)]">
          {suffix}
        </span>
      )}
      <button
        type="button"
        tabIndex={-1}
        aria-hidden="true"
        disabled={disabled || (max !== undefined && value >= max)}
        onClick={() => onChange(clamp(value + step))}
        className={stepBtn}
      >
        +
      </button>
    </div>
  );
}

/* ── Select ─────────────────────────────────────────────────────── */

interface SelectOption {
  value: string | number;
  label: string;
}

interface SelectProps {
  value: string | number;
  onChange: (value: string) => void;
  options: SelectOption[];
  disabled?: boolean;
  ariaLabel?: string;
}

export function Select({ value, onChange, options, disabled, ariaLabel }: SelectProps) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      disabled={disabled}
      aria-label={ariaLabel}
      className={`${FIELD} max-w-[260px] appearance-none pl-2.5 pr-7
        bg-[url('data:image/svg+xml;charset=utf-8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%2210%22%20height%3D%2210%22%20viewBox%3D%220%200%2024%2024%22%20fill%3D%22none%22%20stroke%3D%22%238a91a2%22%20stroke-width%3D%222.5%22%3E%3Cpath%20d%3D%22M6%209l6%206%206-6%22%2F%3E%3C%2Fsvg%3E')]
        bg-[position:right_10px_center] bg-no-repeat`}
    >
      {options.map((opt) => (
        <option key={opt.value} value={opt.value}>
          {opt.label}
        </option>
      ))}
    </select>
  );
}

/* ── Segmented control ──────────────────────────────────────────── */

interface SegmentedOption<T extends string> {
  value: T;
  label: ReactNode;
  /** Accessible name when the label is not plain text. */
  ariaLabel?: string;
  disabled?: boolean;
}

export function Segmented<T extends string>({
  value,
  onChange,
  options,
  disabled,
  ariaLabel,
}: {
  value: T;
  onChange: (value: T) => void;
  options: SegmentedOption<T>[];
  disabled?: boolean;
  ariaLabel?: string;
}) {
  return (
    <div
      role="group"
      aria-label={ariaLabel}
      className="inline-flex flex-wrap gap-0.5 rounded-[9px] bg-gray-900/[0.06] p-[3px] dark:bg-white/[0.06]"
    >
      {options.map((opt) => {
        const active = opt.value === value;
        return (
          <button
            key={opt.value}
            type="button"
            aria-pressed={active}
            aria-label={opt.ariaLabel}
            disabled={disabled || opt.disabled}
            onClick={() => onChange(opt.value)}
            className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-md px-[11px] py-[5px] text-[12px] transition-colors
              focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]
              disabled:cursor-not-allowed disabled:opacity-40 ${
                active
                  ? "bg-[var(--s-card)] font-medium text-[var(--s-fg)] shadow-[0_1px_2px_rgba(0,0,0,0.12)]"
                  : "text-[var(--s-fg-muted)] hover:text-[var(--s-fg)]"
              }`}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}

/* ── Buttons ────────────────────────────────────────────────────── */

const BUTTON_VARIANTS = {
  secondary:
    "border-[var(--s-line)] bg-[var(--s-card)] text-[var(--s-fg)] hover:bg-[var(--s-hover)]",
  primary:
    "border-[var(--accent)] bg-[var(--accent)] text-white hover:bg-[var(--accent-hover)] hover:border-[var(--accent-hover)]",
  danger:
    "border-[var(--s-line)] bg-[var(--s-card)] text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950/30",
  ghost:
    "border-transparent bg-transparent text-[var(--s-fg-muted)] hover:bg-[var(--s-hover)] hover:text-[var(--s-fg)]",
} as const;

/** Class names for a settings button; use on <button> or <a>. */
export function buttonClass(
  variant: keyof typeof BUTTON_VARIANTS = "secondary",
  size: "md" | "sm" = "md",
): string {
  return `inline-flex shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-lg border font-medium transition-colors
    focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-1
    disabled:cursor-not-allowed disabled:opacity-50 ${
      size === "sm" ? "h-[27px] px-2.5 text-[11.5px]" : "h-[31px] px-3 text-[12.5px]"
    } ${BUTTON_VARIANTS[variant]}`;
}

/* ── Shortcut input ────────────────────────────────────────────── */

function keyEventToAccelerator(e: KeyboardEvent): string | null {
  if (["Control", "Shift", "Alt", "Meta"].includes(e.key)) return null;

  const parts: string[] = [];
  if (e.ctrlKey || e.metaKey) parts.push("CommandOrControl");
  if (e.altKey) parts.push("Alt");
  if (e.shiftKey) parts.push("Shift");

  if (parts.length === 0) return null;

  const key = e.code.startsWith("Key")
    ? e.code.slice(3)
    : e.code.startsWith("Digit")
      ? e.code.slice(5)
      : e.code;

  parts.push(key);
  return parts.join("+");
}

export function formatAcceleratorForDisplay(accel: string): string {
  if (!accel) return "";
  const isMac = currentPlatform().os === "macos";
  return accel
    .split("+")
    .map((part) => {
      if (isMac) {
        if (part === "CommandOrControl") return "⌘";
        if (part === "Alt") return "⌥";
        if (part === "Shift") return "⇧";
      } else {
        if (part === "CommandOrControl") return "Ctrl";
      }
      return part;
    })
    .join(isMac ? "" : "+");
}

/** Split a display accelerator into individual key caps ("⌘⇧F8" → ⌘ ⇧ F8). */
function splitAcceleratorDisplay(display: string): string[] {
  return display.includes("+")
    ? display.split("+")
    : Array.from(display.matchAll(/[⌘⌥⇧⌃]|[^⌘⌥⇧⌃]+/g), (m) => m[0]);
}

interface ShortcutInputProps {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}

export function ShortcutInput({ value, onChange, disabled }: ShortcutInputProps) {
  const { t } = useTranslation();
  const [recording, setRecording] = useState(false);
  const ref = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!recording) return;

    const onKeyDown = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();

      if (e.key === "Escape") {
        setRecording(false);
        return;
      }

      const accel = keyEventToAccelerator(e);
      if (accel) {
        onChange(accel);
        setRecording(false);
      }
    };

    const onBlur = () => setRecording(false);

    window.addEventListener("keydown", onKeyDown, true);
    ref.current?.addEventListener("blur", onBlur);
    const btn = ref.current;

    return () => {
      window.removeEventListener("keydown", onKeyDown, true);
      btn?.removeEventListener("blur", onBlur);
    };
  }, [recording, onChange]);

  const display = value ? formatAcceleratorForDisplay(value) : "";
  const keys = display ? splitAcceleratorDisplay(display) : [];

  return (
    <div className="flex items-center gap-1">
      <button
        ref={ref}
        type="button"
        disabled={disabled}
        aria-label={recording ? t("shortcuts.recording") : display || t("shortcuts.notSet")}
        onClick={() => { if (!disabled) setRecording(true); }}
        className={`inline-flex h-[31px] min-w-[132px] items-center justify-center gap-[3px] rounded-lg border px-2.5 text-[12px] transition-[border-color,box-shadow]
          focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]
          ${disabled ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}
          ${recording
            ? "border-[var(--accent)] bg-[var(--s-card)] text-[11.5px] text-[var(--accent)] shadow-[0_0_0_3px_var(--accent-soft)]"
            : value
              ? "border-[var(--s-line)] bg-[var(--s-card)] font-mono text-[var(--s-fg)] hover:border-gray-300 dark:hover:border-gray-600"
              : "border-dashed border-[var(--s-line)] bg-[var(--s-card)] italic text-[var(--s-fg-subtle)] hover:border-gray-300 dark:hover:border-gray-600"
          }`}
      >
        {recording
          ? t("shortcuts.recording")
          : value
            ? keys.map((key, i) => (
                <kbd
                  key={i}
                  className="rounded bg-gray-900/[0.07] px-[5px] py-px font-mono text-[11.5px] dark:bg-white/[0.08]"
                >
                  {key}
                </kbd>
              ))
            : t("shortcuts.notSet")}
      </button>
      {value && !recording && !disabled ? (
        <button
          type="button"
          onClick={() => onChange("")}
          className="flex h-6 w-6 items-center justify-center rounded-md text-[var(--s-fg-subtle)] hover:bg-[var(--s-hover)] hover:text-[var(--s-fg)]
            focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
          title={t("shortcuts.clearShortcut")}
        >
          <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      ) : (
        <span className="w-6" aria-hidden="true" />
      )}
    </div>
  );
}
