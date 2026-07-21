import { useId, useState } from "react";
import { useTranslation } from "react-i18next";
import { formatDuration } from "../utils/time";

interface DailyGoalProgressProps {
  totalDuration: number;
  requiredMinutes: number;
  fullMinutes: number;
  isTimerRunning: boolean;
  /** Used by tests; production renders use the current time. */
  nowMs?: number;
}

export interface DailyGoalProgressState {
  progressPercent: number;
  requiredMarkerPercent: number;
  remainingSeconds: number;
  nextMilestone: "required" | "full" | "complete";
  estimatedCompletionMs: number | null;
}

export function getDailyGoalProgressState(
  totalDuration: number,
  requiredMinutes: number,
  fullMinutes: number,
  isTimerRunning: boolean,
  nowMs = Date.now(),
): DailyGoalProgressState {
  const safeRequiredMinutes = Math.max(1, requiredMinutes);
  const safeFullMinutes = Math.max(safeRequiredMinutes, fullMinutes);
  const workedSeconds = Math.max(0, totalDuration);
  const requiredSeconds = safeRequiredMinutes * 60;
  const fullSeconds = safeFullMinutes * 60;
  const nextMilestone =
    workedSeconds < requiredSeconds
      ? "required"
      : workedSeconds < fullSeconds
        ? "full"
        : "complete";
  const targetSeconds = nextMilestone === "required" ? requiredSeconds : fullSeconds;
  const remainingSeconds = Math.max(0, targetSeconds - workedSeconds);

  return {
    progressPercent: Math.min(100, (workedSeconds / fullSeconds) * 100),
    requiredMarkerPercent: (requiredSeconds / fullSeconds) * 100,
    remainingSeconds,
    nextMilestone,
    estimatedCompletionMs:
      isTimerRunning && remainingSeconds > 0
        ? nowMs + remainingSeconds * 1000
        : null,
  };
}

function formatRemaining(seconds: number): string {
  if (seconds <= 0) return formatDuration(0);
  return formatDuration(Math.ceil(seconds / 60) * 60);
}

function formatGoal(minutes: number): string {
  return formatDuration(minutes * 60);
}

export default function DailyGoalProgress({
  totalDuration,
  requiredMinutes,
  fullMinutes,
  isTimerRunning,
  nowMs = Date.now(),
}: DailyGoalProgressProps) {
  const { t, i18n } = useTranslation();
  const [expanded, setExpanded] = useState(false);
  const detailsId = useId();
  const safeFullMinutes = Math.max(requiredMinutes, fullMinutes);
  const state = getDailyGoalProgressState(
    totalDuration,
    requiredMinutes,
    safeFullMinutes,
    isTimerRunning,
    nowMs,
  );
  const estimatedTime = state.estimatedCompletionMs
    ? new Intl.DateTimeFormat(i18n.resolvedLanguage, {
        hour: "2-digit",
        minute: "2-digit",
      }).format(new Date(state.estimatedCompletionMs))
    : null;
  const statusLabel =
    state.nextMilestone === "complete"
      ? t("today.dailyGoalComplete")
      : state.nextMilestone === "full"
        ? t("today.requiredGoalComplete")
        : t("today.remainingToRequired", {
            duration: formatRemaining(state.remainingSeconds),
          });

  return (
    <section className="relative mx-2.5 mb-1.5 overflow-hidden rounded-lg border border-gray-100 bg-gray-50/80 dark:border-gray-800 dark:bg-gray-900/40">
      <button
        type="button"
        className="absolute inset-0 z-10 rounded-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--accent)]"
        aria-expanded={expanded}
        aria-controls={detailsId}
        aria-label={
          expanded
            ? t("today.collapseDailyGoal")
            : t("today.expandDailyGoal")
        }
        onClick={() => setExpanded((value) => !value)}
      >
        <span className="sr-only">
          {expanded
            ? t("today.collapseDailyGoal")
            : t("today.expandDailyGoal")}
        </span>
      </button>
      <div className="flex w-full items-center justify-between gap-3 px-2.5 pt-2 pb-1 text-left">
        <span className="text-[11px] font-medium text-gray-600 dark:text-gray-300">
          {t("today.dailyGoal")}
        </span>
        <span className="flex items-center gap-1.5">
          <span className="text-[11px] tabular-nums text-gray-500 dark:text-gray-400">
            {formatDuration(totalDuration)} / {formatGoal(safeFullMinutes)}
          </span>
          <svg
            aria-hidden="true"
            viewBox="0 0 20 20"
            fill="none"
            className={`h-3 w-3 text-gray-400 transition-transform dark:text-gray-500 ${
              expanded ? "rotate-180" : ""
            }`}
          >
            <path
              d="m5.5 7.5 4.5 4 4.5-4"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </span>
      </div>

      <div
        className="relative mx-2.5 mt-1 mb-2 h-1.5 overflow-hidden rounded-full bg-gray-200 dark:bg-gray-700"
        role="progressbar"
        aria-label={t("today.dailyGoal")}
        aria-valuemin={0}
        aria-valuemax={safeFullMinutes * 60}
        aria-valuenow={Math.min(Math.max(0, Math.round(totalDuration)), safeFullMinutes * 60)}
        aria-valuetext={`${formatDuration(totalDuration)} / ${formatGoal(safeFullMinutes)}`}
      >
        <div
          className={`h-full rounded-full transition-[width] duration-500 ${
            state.nextMilestone === "complete"
              ? "bg-emerald-500"
              : "bg-[var(--accent)]"
          }`}
          style={{ width: `${state.progressPercent}%` }}
        />
        {requiredMinutes < safeFullMinutes && (
          <span
            className="absolute inset-y-0 w-px bg-white/90 shadow-[0_0_0_1px_rgba(0,0,0,0.12)] dark:bg-gray-300"
            style={{ left: `${state.requiredMarkerPercent}%` }}
            title={t("today.requiredGoal", { duration: formatGoal(requiredMinutes) })}
          />
        )}
      </div>

      {expanded && (
        <div id={detailsId} className="px-2.5 pb-2" role="region">
          <div className="flex items-start justify-between gap-2 text-[10px] leading-4 text-gray-400 dark:text-gray-500">
            <span>
              {statusLabel}
              {state.nextMilestone === "full" && (
                <> · {t("today.remainingToFull", { duration: formatRemaining(state.remainingSeconds) })}</>
              )}
            </span>
            <span className="shrink-0 tabular-nums">
              {estimatedTime
                ? t("today.estimatedCompletion", { time: estimatedTime })
                : state.nextMilestone !== "complete" && !isTimerRunning
                  ? t("today.startTimerForEstimate")
                  : null}
            </span>
          </div>

          <div className="mt-1 flex justify-between text-[9px] text-gray-400/90 dark:text-gray-600">
            <span>{t("today.requiredGoal", { duration: formatGoal(requiredMinutes) })}</span>
            <span>{t("today.fullGoal", { duration: formatGoal(safeFullMinutes) })}</span>
          </div>
        </div>
      )}
    </section>
  );
}
