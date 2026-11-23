import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { getIdleStats, type IdlePeriod } from "../api/idleApi";
import { SettingsCard } from "./SettingsLayout";
import { buttonClass } from "./Controls";
import { dailyIdleStats } from "./idleStats";

export default function IdleStatistics({ retentionDays }: { retentionDays: number }) {
  const { t, i18n } = useTranslation();
  const [expanded, setExpanded] = useState(false);
  const [periods, setPeriods] = useState<IdlePeriod[] | null>(null);
  const [error, setError] = useState(false);
  const [page, setPage] = useState(0);

  useEffect(() => {
    if (!expanded) return;
    let cancelled = false;
    let timeout: ReturnType<typeof setTimeout>;
    const refresh = async () => {
      try {
        const data = await getIdleStats();
        if (!cancelled) { setPeriods(data); setError(false); }
      } catch {
        if (!cancelled) setError(true);
      } finally {
        if (!cancelled) timeout = setTimeout(refresh, 10_000);
      }
    };
    void refresh();
    return () => { cancelled = true; clearTimeout(timeout); };
  }, [expanded, retentionDays]);

  const duration = (seconds: number) => t("idle.statsDuration", {
    hours: Math.floor(seconds / 3600), minutes: Math.floor(seconds % 3600 / 60), seconds: Math.floor(seconds % 60),
  });
  const days = Math.min(14, retentionDays);
  const daily = dailyIdleStats(periods ?? [], days);
  const maximum = Math.max(1, ...daily.map((day) => day.seconds));
  const total = (periods ?? []).reduce((sum, period) => sum + period.endedAt - period.startedAt, 0);
  const sorted = [...(periods ?? [])].reverse();
  const lastPage = Math.max(0, Math.ceil(sorted.length / 20) - 1);
  const currentPage = Math.min(page, lastPage);
  const btn = buttonClass("secondary", "sm");

  return (
    <SettingsCard description={t("idle.statsDescription")}>
      <button type="button" className={btn} aria-expanded={expanded} aria-controls="idle-statistics" onClick={() => setExpanded(!expanded)}>
        {t(expanded ? "idle.statsHide" : "idle.statsShow")}
      </button>
      {expanded && <div id="idle-statistics" className="mt-4 space-y-4 text-[11.5px] text-[var(--s-fg-muted)] tabular-nums">
        {error ? <p role="alert">{t("idle.statsError")}</p> : periods === null ? <p role="status">{t("idle.statsLoading")}</p> : <>
          <p>{t("idle.statsSummary", { count: periods.length, duration: duration(total), days: retentionDays })}</p>
          {periods.length === 0 ? <p>{t("idle.statsEmpty")}</p> : <>
            <figure>
              <figcaption className="mb-2 font-medium">{t("idle.statsChart", { days })}</figcaption>
              <div className="flex h-32 items-end gap-1" role="img" aria-label={t("idle.statsChart", { days })}>
                {daily.map(({ date, seconds }) => <div key={date.toISOString()} className="flex h-full min-w-0 flex-1 flex-col justify-end text-center">
                  <div title={`${date.toLocaleDateString(i18n.language)}: ${duration(seconds)}`} className="mx-auto w-3/5 rounded-t-[3px] bg-[var(--accent)] opacity-75 transition-opacity hover:opacity-100" style={{ height: `${seconds / maximum * 100}%`, minHeight: seconds > 0 ? 2 : 0 }} />
                  <span className="mt-1 font-mono text-[9px] text-[var(--s-fg-subtle)]">{date.getDate()}</span>
                </div>)}
              </div>
              <details className="mt-2">
                <summary className="cursor-pointer">{t("idle.statsDailyValues")}</summary>
                <ul className="mt-2 space-y-1">{daily.map(({ date, seconds }) => <li key={date.toISOString()}>{date.toLocaleDateString(i18n.language)}: {duration(seconds)}</li>)}</ul>
              </details>
            </figure>
            <p className="text-[var(--s-fg-subtle)]">{t("idle.statsObserved")}</p>
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead><tr>{["statsStart", "statsEnd", "statsLength"].map((key) => <th key={key} scope="col" className="py-2 pr-3">{t(`idle.${key}`)}</th>)}</tr></thead>
                <tbody>{sorted.slice(currentPage * 20, currentPage * 20 + 20).map((period, index) => <tr key={`${period.startedAt}-${index}`} className="border-t border-[var(--s-line-soft)]">
                  <td className="py-2 pr-3">{new Date(period.startedAt * 1000).toLocaleString(i18n.language)}</td>
                  <td className="py-2 pr-3">{new Date(period.endedAt * 1000).toLocaleString(i18n.language)}</td>
                  <td className="py-2">{duration(period.endedAt - period.startedAt)}</td>
                </tr>)}</tbody>
              </table>
            </div>
            {lastPage > 0 && <div className="flex items-center justify-between gap-2">
              <button className={btn} disabled={currentPage === 0} onClick={() => setPage(currentPage - 1)}>{t("idle.statsPrevious")}</button>
              <span>{currentPage + 1} / {lastPage + 1}</span>
              <button className={btn} disabled={currentPage === lastPage} onClick={() => setPage(currentPage + 1)}>{t("idle.statsNext")}</button>
            </div>}
          </>}
        </>}
      </div>}
    </SettingsCard>
  );
}
