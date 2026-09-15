import { useState } from "react";
import { useTranslation } from "react-i18next";
import { openUrl } from "@tauri-apps/plugin-opener";
import type { useIssueTimeSync } from "../tray/useIssueTimeSync";
import { matchesTimeSyncSession } from "../integrations/issues/issueTimeSyncQueue";

export default function IssueTimeSyncFeedback({ sync }: { sync: ReturnType<typeof useIssueTimeSync> }) {
  const { t } = useTranslation();
  const [confirming, setConfirming] = useState<string | null>(null);
  const [openError, setOpenError] = useState(false);
  if (!sync.storageError && sync.problems.length === 0) return null;
  const buttonClass = "rounded border border-current/30 px-2 py-1 hover:bg-amber-500/10 disabled:opacity-50";
  return (
    <div className="mx-3 my-1 max-h-48 shrink-0 overflow-y-auto rounded-md border border-amber-400/40 bg-amber-50 p-2 text-xs text-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
      <p className="font-medium">{t("timeSync.title")}</p>
      {sync.storageError && <p role="alert">{t("timeSync.storageError")}</p>}
      {openError && <p role="alert">{t("timeSync.openError")}</p>}
      {sync.problems.map((job) => {
        const matches = !!sync.session && matchesTimeSyncSession(job, sync.session);
        const uncertain = job.status === "uncertain";
        return (
          <div key={job.id} className="mt-2 space-y-1 border-t border-amber-400/20 pt-2">
            <p>{t("timeSync.entry", { timesheet: job.timesheetId, issue: job.issueId })}</p>
            <p>{t(!matches ? "timeSync.destinationChanged" : uncertain ? "timeSync.uncertain" : "timeSync.pending")}</p>
            <div className="flex flex-wrap gap-2">
              <button type="button" className={buttonClass} onClick={() => {
                setOpenError(false);
                void openUrl(job.issueUrl).catch(() => setOpenError(true));
              }}>{t("integrations.openInBrowser")}</button>
              {matches && uncertain && <>
                <button type="button" className={buttonClass} disabled={sync.resolving}
                  onClick={() => { void sync.resolve(job.id, "recorded"); }}>{t("timeSync.recorded")}</button>
                <button type="button" className={buttonClass} disabled={sync.resolving}
                  onClick={() => setConfirming(job.id)}>{t("timeSync.retry")}</button>
              </>}
            </div>
            {confirming === job.id && matches && uncertain && (
              <div className="space-y-1" role="alert">
                <p>{t("timeSync.retryWarning")}</p>
                <div className="flex gap-2">
                  <button type="button" className={buttonClass} disabled={sync.resolving} onClick={() => {
                    setConfirming(null);
                    void sync.resolve(job.id, "retry");
                  }}>{t("timeSync.confirmRetry")}</button>
                  <button type="button" className={buttonClass} onClick={() => setConfirming(null)}>{t("common.cancel")}</button>
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
