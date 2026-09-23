import { useTranslation } from "react-i18next";
import type { ColorMode, TodayEntry } from "../types";
import { resolveDisplayColors } from "../utils/colorMode";
import { formatDuration, formatTime, parseKimaiDate } from "../utils/time";

interface TodayTimelineBarProps {
  entries: TodayEntry[];
  colorMode?: ColorMode;
  /** Used by tests; production renders use the current time. */
  nowMs?: number;
}

/** Thin strip showing how today's entries are spread across the day. */
export default function TodayTimelineBar({
  entries,
  colorMode = "kimai",
  nowMs = Date.now(),
}: TodayTimelineBarProps) {
  const { t } = useTranslation();
  const segments = entries.map((entry) => {
    const beginMs = parseKimaiDate(entry.beginIso).getTime();
    const endMs =
      entry.isRunning || !entry.endIso
        ? nowMs
        : parseKimaiDate(entry.endIso).getTime();
    return { entry, beginMs, endMs: Math.max(beginMs, endMs) };
  });
  if (segments.length < 2) return null;

  const start = Math.min(...segments.map((s) => s.beginMs));
  const end = Math.max(...segments.map((s) => s.endMs));
  const span = end - start;
  if (span <= 0) return null;

  return (
    <div
      role="img"
      aria-label={t("today.timeline")}
      className="relative mx-3 mb-1.5 h-1 overflow-hidden rounded-full bg-gray-100 dark:bg-white/[0.06]"
    >
      {segments.map(({ entry, beginMs, endMs }) => {
        const [color] = resolveDisplayColors(
          entry.activityColor,
          entry.projectColor,
          entry.customerColor,
          colorMode,
        );
        return (
          <span
            key={entry.id}
            data-testid="timeline-segment"
            title={`${entry.project} · ${formatTime(entry.beginIso)}–${
              entry.isRunning ? t("common.now") : formatTime(entry.endIso ?? entry.beginIso)
            } · ${formatDuration(Math.floor((endMs - beginMs) / 1000))}`}
            className={`absolute inset-y-0 ${entry.isRunning ? "animate-pulse" : ""}`}
            style={{
              left: `${((beginMs - start) / span) * 100}%`,
              width: `max(2px, ${((endMs - beginMs) / span) * 100}%)`,
              backgroundColor: color,
            }}
          />
        );
      })}
    </div>
  );
}
