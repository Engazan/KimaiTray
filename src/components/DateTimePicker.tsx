import { useState, useRef, useEffect, useMemo, useLayoutEffect } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";

interface DateTimePickerProps {
  value: string;
  onChange: (value: string) => void;
  onClose?: () => void;
  disabled?: boolean;
  className?: string;
  compact?: boolean;
}

const POPUP_WIDTH = 240;
const POPUP_MARGIN = 8;
const POPUP_GAP = 4;

function pad(n: number) {
  return n.toString().padStart(2, "0");
}

function toLocalISO(d: Date) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function daysInMonth(year: number, month: number) {
  return new Date(year, month + 1, 0).getDate();
}

function startOfWeek(year: number, month: number) {
  const d = new Date(year, month, 1).getDay();
  return d === 0 ? 6 : d - 1;
}

export default function DateTimePicker({
  value,
  onChange,
  onClose,
  disabled,
  className,
  compact,
}: DateTimePickerProps) {
  const { i18n } = useTranslation();
  const [open, setOpen] = useState(false);
  const [popupPos, setPopupPos] = useState({ top: 0, left: 0 });
  const ref = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const popupRef = useRef<HTMLDivElement>(null);

  const parsed = value ? new Date(value) : null;
  const [viewYear, setViewYear] = useState(parsed?.getFullYear() ?? new Date().getFullYear());
  const [viewMonth, setViewMonth] = useState(parsed?.getMonth() ?? new Date().getMonth());
  const [hour, setHour] = useState(parsed ? pad(parsed.getHours()) : pad(new Date().getHours()));
  const [minute, setMinute] = useState(parsed ? pad(parsed.getMinutes()) : pad(new Date().getMinutes()));

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      const target = e.target as Node;
      if (ref.current?.contains(target) || popupRef.current?.contains(target)) return;
      setOpen(false);
      onClose?.();
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open, onClose]);

  useEffect(() => {
    if (open && parsed) {
      setViewYear(parsed.getFullYear());
      setViewMonth(parsed.getMonth());
      setHour(pad(parsed.getHours()));
      setMinute(pad(parsed.getMinutes()));
    }
  }, [open]);

  useLayoutEffect(() => {
    if (!open) return;

    const updatePosition = () => {
      const rect = buttonRef.current?.getBoundingClientRect();
      if (!rect) return;

      const popupWidth = Math.min(POPUP_WIDTH, window.innerWidth - POPUP_MARGIN * 2);
      const popupHeight = popupRef.current?.offsetHeight ?? 320;
      const maxLeft = window.innerWidth - popupWidth - POPUP_MARGIN;
      const left = Math.min(Math.max(POPUP_MARGIN, rect.left), maxLeft);
      const belowTop = rect.bottom + POPUP_GAP;
      const aboveTop = rect.top - popupHeight - POPUP_GAP;
      const top = belowTop + popupHeight <= window.innerHeight - POPUP_MARGIN || aboveTop < POPUP_MARGIN
        ? Math.min(belowTop, window.innerHeight - popupHeight - POPUP_MARGIN)
        : aboveTop;

      setPopupPos({
        top: Math.max(POPUP_MARGIN, top),
        left,
      });
    };

    updatePosition();
    const frame = window.requestAnimationFrame(updatePosition);
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);

    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [open, viewMonth, viewYear]);

  const locale = i18n.language || "en";

  const dayNames = useMemo(() => {
    const fmt = new Intl.DateTimeFormat(locale, { weekday: "narrow" });
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(2024, 0, i + 1); // 2024-01-01 is Monday
      return fmt.format(d);
    });
  }, [locale]);

  const monthName = useMemo(() => {
    const fmt = new Intl.DateTimeFormat(locale, { month: "long", year: "numeric" });
    return fmt.format(new Date(viewYear, viewMonth, 1));
  }, [locale, viewYear, viewMonth]);

  const days = daysInMonth(viewYear, viewMonth);
  const offset = startOfWeek(viewYear, viewMonth);

  const today = new Date();
  const todayStr = `${today.getFullYear()}-${pad(today.getMonth() + 1)}-${pad(today.getDate())}`;

  const selectedDay = parsed
    ? `${parsed.getFullYear()}-${pad(parsed.getMonth() + 1)}-${pad(parsed.getDate())}`
    : null;

  const selectDay = (day: number) => {
    const h = parseInt(hour) || 0;
    const m = parseInt(minute) || 0;
    const d = new Date(viewYear, viewMonth, day, h, m);
    onChange(toLocalISO(d));
  };

  const updateTime = (newHour: string, newMinute: string) => {
    const h = parseInt(newHour) || 0;
    const m = parseInt(newMinute) || 0;
    setHour(pad(h));
    setMinute(pad(m));
    if (parsed) {
      const d = new Date(parsed.getFullYear(), parsed.getMonth(), parsed.getDate(), h, m);
      onChange(toLocalISO(d));
    }
  };

  const selectNow = () => {
    const now = new Date();
    setViewYear(now.getFullYear());
    setViewMonth(now.getMonth());
    setHour(pad(now.getHours()));
    setMinute(pad(now.getMinutes()));
    onChange(toLocalISO(now));
  };

  const prevMonth = () => {
    if (viewMonth === 0) {
      setViewMonth(11);
      setViewYear(viewYear - 1);
    } else {
      setViewMonth(viewMonth - 1);
    }
  };

  const nextMonth = () => {
    if (viewMonth === 11) {
      setViewMonth(0);
      setViewYear(viewYear + 1);
    } else {
      setViewMonth(viewMonth + 1);
    }
  };

  const displayValue = useMemo(() => {
    if (!parsed) return "";
    const fmt = new Intl.DateTimeFormat(locale, {
      day: "numeric",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
    return fmt.format(parsed);
  }, [parsed, locale]);

  const textSize = compact ? "text-[11px]" : "text-[13px]";
  const py = compact ? "py-1" : "py-2";

  return (
    <div ref={ref} className="relative">
      <button
        ref={buttonRef}
        type="button"
        onClick={() => !disabled && setOpen(!open)}
        disabled={disabled}
        className={
          className ??
          `w-full rounded-lg border border-gray-300 dark:border-white/20 bg-white dark:bg-white/[0.08] px-3 ${py} ${textSize} text-left text-gray-700 dark:text-gray-300 disabled:opacity-40 transition-colors focus:outline-none focus:border-[var(--accent)] focus:ring-1 focus:ring-[var(--accent)] flex items-center justify-between gap-2`
        }
      >
        <span className={parsed ? "" : "text-gray-400 dark:text-gray-500"}>
          {displayValue || "—"}
        </span>
        <svg className="h-3.5 w-3.5 text-gray-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5" />
        </svg>
      </button>

      {open && createPortal((
        <div
          ref={popupRef}
          className="fixed z-[9999] w-[15rem] max-w-[calc(100vw-1rem)] rounded-xl border border-gray-200 dark:border-white/15 bg-white dark:bg-gray-800 shadow-xl shadow-black/10 dark:shadow-black/30 overflow-hidden"
          style={{ top: popupPos.top, left: popupPos.left }}
        >
          {/* Month nav */}
          <div className="flex items-center justify-between px-3 py-2 border-b border-gray-100 dark:border-white/10">
            <button
              type="button"
              onClick={prevMonth}
              className="p-1 rounded-md hover:bg-gray-100 dark:hover:bg-white/10 text-gray-500 dark:text-gray-400 transition-colors"
            >
              <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
              </svg>
            </button>
            <span className="text-[12px] font-semibold text-gray-700 dark:text-gray-200 capitalize">
              {monthName}
            </span>
            <button
              type="button"
              onClick={nextMonth}
              className="p-1 rounded-md hover:bg-gray-100 dark:hover:bg-white/10 text-gray-500 dark:text-gray-400 transition-colors"
            >
              <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
              </svg>
            </button>
          </div>

          {/* Day headers */}
          <div className="grid grid-cols-7 gap-y-1 px-2 pt-2">
            {dayNames.map((d, i) => (
              <div key={i} className="text-center text-[9px] font-medium text-gray-400 dark:text-gray-500 pb-1">
                {d}
              </div>
            ))}
          </div>

          {/* Calendar grid */}
          <div className="grid grid-cols-7 gap-y-1 px-2 pb-2">
            {Array.from({ length: offset }, (_, i) => (
              <div key={`e-${i}`} />
            ))}
            {Array.from({ length: days }, (_, i) => {
              const day = i + 1;
              const dateStr = `${viewYear}-${pad(viewMonth + 1)}-${pad(day)}`;
              const isToday = dateStr === todayStr;
              const isSelected = dateStr === selectedDay;
              return (
                <button
                  key={day}
                  type="button"
                  onClick={() => selectDay(day)}
                  className={`h-7 w-7 mx-auto rounded-full text-[11px] font-medium transition-colors
                    ${isSelected
                      ? "bg-[var(--accent)] text-white"
                      : isToday
                        ? "bg-[var(--accent)]/15 text-[var(--accent)] font-semibold"
                        : "text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-white/10"
                    }`}
                >
                  {day}
                </button>
              );
            })}
          </div>

          {/* Time + Now */}
          <div className="flex items-center gap-2 px-3 py-2 border-t border-gray-100 dark:border-white/10">
            <svg className="h-3.5 w-3.5 text-gray-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <input
              type="text"
              inputMode="numeric"
              maxLength={2}
              value={hour}
              onChange={(e) => {
                const v = e.target.value.replace(/\D/g, "").slice(0, 2);
                setHour(v);
              }}
              onBlur={() => updateTime(hour, minute)}
              className="w-8 text-center text-[12px] font-mono rounded-md border border-gray-200 dark:border-white/15 bg-gray-50 dark:bg-white/[0.06] py-1 text-gray-700 dark:text-gray-300 focus:outline-none focus:border-[var(--accent)] focus:ring-1 focus:ring-[var(--accent)]"
            />
            <span className="text-[12px] font-semibold text-gray-400">:</span>
            <input
              type="text"
              inputMode="numeric"
              maxLength={2}
              value={minute}
              onChange={(e) => {
                const v = e.target.value.replace(/\D/g, "").slice(0, 2);
                setMinute(v);
              }}
              onBlur={() => updateTime(hour, minute)}
              className="w-8 text-center text-[12px] font-mono rounded-md border border-gray-200 dark:border-white/15 bg-gray-50 dark:bg-white/[0.06] py-1 text-gray-700 dark:text-gray-300 focus:outline-none focus:border-[var(--accent)] focus:ring-1 focus:ring-[var(--accent)]"
            />
            <button
              type="button"
              onClick={selectNow}
              className="ml-auto text-[10px] font-semibold text-[var(--accent)] hover:text-[var(--accent-hover)] transition-colors"
            >
              Now
            </button>
          </div>
        </div>
      ), document.body)}
    </div>
  );
}
