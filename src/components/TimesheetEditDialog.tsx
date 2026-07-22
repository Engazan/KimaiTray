import { useEffect, useId, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { KimaiApiError } from "../api/kimaiClient";
import type { KimaiTimesheetUpdate } from "../api/kimaiTypes";
import type { TodayEntry } from "../types";
import { formatDuration } from "../utils/time";
import {
  buildTimesheetTimeUpdate,
  initialTimesheetTimeDraft,
  type TimesheetTimeEditError,
} from "../utils/timesheetTimeEdit";
import DateTimePicker from "./DateTimePicker";

interface TimesheetEditDialogProps {
  entry: TodayEntry;
  onSave: (id: number, payload: KimaiTimesheetUpdate) => Promise<unknown>;
  onClose: () => void;
}

function validationMessage(
  error: TimesheetTimeEditError,
  t: ReturnType<typeof useTranslation>["t"],
): string {
  return error === "endBeforeBegin"
    ? t("today.endBeforeBegin")
    : t("timer.invalidTime");
}

function apiErrorMessage(
  error: unknown,
  t: ReturnType<typeof useTranslation>["t"],
): string {
  if (error instanceof KimaiApiError && error.code === "forbidden") {
    return t("today.editForbidden");
  }
  if (error instanceof KimaiApiError && error.code === "unauthorized") {
    return t("errors.unauthorized");
  }
  return error instanceof Error && error.message
    ? error.message
    : t("today.editFailed");
}

export default function TimesheetEditDialog({
  entry,
  onSave,
  onClose,
}: TimesheetEditDialogProps) {
  const { t } = useTranslation();
  const titleId = useId();
  const beginId = useId();
  const endId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const isSavingRef = useRef(false);
  const initial = useMemo(() => initialTimesheetTimeDraft(entry), [entry]);
  const [begin, setBegin] = useState(initial.begin);
  const [end, setEnd] = useState(initial.end);
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    isSavingRef.current = isSaving;
  }, [isSaving]);

  useEffect(() => {
    setBegin(initial.begin);
    setEnd(initial.end);
    setError(null);
    setIsSaving(false);
  }, [entry.id, initial.begin, initial.end]);

  useEffect(() => {
    const previouslyFocused = document.activeElement as HTMLElement | null;
    cancelRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented) return;
      if (event.key === "Escape") {
        event.preventDefault();
        if (!isSavingRef.current) onClose();
        return;
      }
      if (event.key !== "Tab") return;
      const focusable = Array.from(
        dialogRef.current?.querySelectorAll<HTMLElement>(
          "button:not(:disabled), input:not(:disabled), [tabindex]:not([tabindex='-1'])",
        ) ?? [],
      );
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      window.requestAnimationFrame(() => previouslyFocused?.focus());
    };
  }, [onClose]);

  const changed = begin !== initial.begin || end !== initial.end;
  const beginDate = new Date(begin);
  const endDate = new Date(end);
  const previewSeconds =
    Number.isFinite(beginDate.getTime()) &&
    Number.isFinite(endDate.getTime()) &&
    endDate >= beginDate
      ? Math.floor((endDate.getTime() - beginDate.getTime()) / 1000)
      : null;

  const updateBegin = (value: string) => {
    setBegin(value);
    setError(null);
  };
  const updateEnd = (value: string) => {
    setEnd(value);
    setError(null);
  };

  const submit = async () => {
    if (!changed || isSaving) return;
    const result = buildTimesheetTimeUpdate(entry, begin, end);
    if (!result.ok) {
      setError(validationMessage(result.error, t));
      return;
    }

    setError(null);
    setIsSaving(true);
    try {
      await onSave(entry.id, result.payload);
      onClose();
    } catch (saveError) {
      setError(apiErrorMessage(saveError, t));
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="absolute inset-0 z-40 flex items-center justify-center bg-black/45 p-3 backdrop-blur-sm">
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="w-full max-w-[330px] overflow-hidden rounded-xl border border-gray-200 bg-white shadow-2xl dark:border-gray-700 dark:bg-[#202020]"
      >
        <header className="flex items-start gap-3 border-b border-gray-100 px-4 py-3 dark:border-gray-800">
          <div className="min-w-0 flex-1">
            <h2
              id={titleId}
              className="text-[14px] font-semibold text-gray-900 dark:text-gray-100"
            >
              {t("today.editEntry")}
            </h2>
            <p className="mt-0.5 truncate text-[11px] text-gray-500 dark:text-gray-400">
              {entry.project} · {entry.activity}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={isSaving}
            aria-label={t("common.cancel")}
            className="rounded-md p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600 focus:outline-none focus-visible:ring-1 focus-visible:ring-[var(--accent)] disabled:opacity-40 dark:hover:bg-gray-800 dark:hover:text-gray-200"
          >
            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" d="M6 6l12 12M18 6 6 18" />
            </svg>
          </button>
        </header>

        <div className="space-y-3 px-4 py-3">
          <div>
            <label
              htmlFor={beginId}
              className="mb-1 block text-[10px] font-medium uppercase tracking-wide text-gray-400 dark:text-gray-500"
            >
              {t("today.startTime")}
            </label>
            <DateTimePicker
              id={beginId}
              value={begin}
              onChange={updateBegin}
              disabled={isSaving}
            />
          </div>
          <div>
            <label
              htmlFor={endId}
              className="mb-1 block text-[10px] font-medium uppercase tracking-wide text-gray-400 dark:text-gray-500"
            >
              {t("today.endTime")}
            </label>
            <DateTimePicker
              id={endId}
              value={end}
              onChange={updateEnd}
              disabled={isSaving}
            />
          </div>

          <div className="flex items-center justify-between rounded-lg bg-gray-50 px-3 py-2 dark:bg-gray-800/60">
            <span className="text-[11px] text-gray-500 dark:text-gray-400">
              {t("today.duration")}
            </span>
            <span className="text-[12px] font-medium tabular-nums text-gray-700 dark:text-gray-200">
              {previewSeconds === null ? "—" : formatDuration(previewSeconds)}
            </span>
          </div>

          <p className="text-[10px] leading-4 text-gray-400 dark:text-gray-500">
            {t("today.editRestrictionsHint")}
          </p>

          {error && (
            <div
              role="alert"
              className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-[11px] leading-4 text-red-600 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-400"
            >
              {error}
            </div>
          )}
        </div>

        <footer className="flex justify-end gap-2 border-t border-gray-100 px-4 py-3 dark:border-gray-800">
          <button
            ref={cancelRef}
            type="button"
            onClick={onClose}
            disabled={isSaving}
            className="rounded-md px-3 py-1.5 text-[11px] font-medium text-gray-500 hover:bg-gray-100 focus:outline-none focus-visible:ring-1 focus-visible:ring-[var(--accent)] disabled:opacity-40 dark:text-gray-400 dark:hover:bg-gray-800"
          >
            {t("common.cancel")}
          </button>
          <button
            type="button"
            onClick={() => void submit()}
            disabled={!changed || isSaving}
            className="rounded-md bg-[var(--accent)] px-3.5 py-1.5 text-[11px] font-medium text-white hover:bg-[var(--accent-hover)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-2 disabled:opacity-40 dark:ring-offset-[#202020]"
          >
            {isSaving ? t("common.saving") : t("common.save")}
          </button>
        </footer>
      </div>
    </div>
  );
}
