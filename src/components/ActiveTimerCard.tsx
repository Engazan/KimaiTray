import { useEffect, useState, useRef } from "react";
import { useTranslation } from "react-i18next";
import { getCurrentWindow } from "@tauri-apps/api/window";
import type { ActiveTimer, ColorMode } from "../types";
import type { KimaiTag } from "../api/tagApi";
import {
  parseKimaiDate,
  toDateTimeLocalInput,
  toKimaiLocal,
} from "../utils/time";
import TagsList from "./TagsList";
import TagsInput from "./TagsInput";
import DateTimePicker from "./DateTimePicker";
import ColorDots from "./ColorDots";

interface ActiveTimerCardProps {
  timer: ActiveTimer;
  onStop: () => void;
  onPause?: () => void;
  isStopping?: boolean;
  isPausing?: boolean;
  multipleActive?: boolean;
  onEdit?: (
    id: number,
    payload: { description?: string; begin?: string; tags?: string[] },
  ) => void;
  isSaving?: boolean;
  saveError?: string | null;
  compact?: boolean;
  focusMode?: boolean;
  showNote?: boolean;
  showTags?: boolean;
  tagSuggestions?: KimaiTag[];
  issueUrl?: string | null;
  /** Linked issue's time estimate in seconds (GitLab). Undefined hides the badge. */
  timeEstimate?: number;
  /** Time already logged on the issue before this session, in seconds. */
  timeSpent?: number;
  colorMode?: ColorMode;
  editDescriptionRequest?: number;
  onEditDescriptionRequestHandled?: () => void;
}

/** Compact duration formatting: "5h", "1h30m", "45m". */
function formatBudget(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h > 0) return m > 0 ? `${h}h${m}m` : `${h}h`;
  return `${m}m`;
}

function formatElapsed(seconds: number, showSeconds = true): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  if (!showSeconds) return `${pad(h)}:${pad(m)}`;
  return `${pad(h)}:${pad(m)}:${pad(s)}`;
}

function formatStartTime(iso: string): string {
  return parseKimaiDate(iso).toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function ActiveTimerCard({
  timer,
  onStop,
  onPause,
  isStopping,
  isPausing,
  multipleActive,
  onEdit,
  isSaving,
  saveError,
  compact,
  focusMode,
  showNote = true,
  showTags = true,
  tagSuggestions = [],
  issueUrl,
  timeEstimate,
  timeSpent,
  colorMode = "kimai",
  editDescriptionRequest = 0,
  onEditDescriptionRequestHandled,
}: ActiveTimerCardProps) {
  const { t } = useTranslation();
  const [elapsed, setElapsed] = useState(() =>
    Math.max(0, Math.floor(Date.now() / 1000) - timer.beginSeconds),
  );

  useEffect(() => {
    const tick = () =>
      setElapsed(
        Math.max(0, Math.floor(Date.now() / 1000) - timer.beginSeconds),
      );
    tick();
    // setInterval handles the normal case; kimai://tick from the native Rust
    // thread is a fallback for Linux where WebKitGTK throttles JS timers.
    const id = setInterval(tick, 1000);
    const unlistenPromise = getCurrentWindow().listen("kimai://tick", tick);
    return () => {
      clearInterval(id);
      unlistenPromise.then((fn: () => void) => fn());
    };
  }, [timer.beginSeconds]);

  // ── Description editing ──
  const [editingDesc, setEditingDesc] = useState(false);
  const [descValue, setDescValue] = useState("");
  const descRef = useRef<HTMLInputElement>(null);

  const startEditDesc = () => {
    if (!onEdit) return;
    setDescValue(timer.description);
    setEditingDesc(true);
  };

  useEffect(() => {
    if (editingDesc) descRef.current?.focus();
  }, [editingDesc]);

  const saveDesc = () => {
    setEditingDesc(false);
    onEditDescriptionRequestHandled?.();
    if (descValue !== timer.description) {
      onEdit?.(timer.id, { description: descValue });
    }
  };

  const handleDescKey = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      saveDesc();
    } else if (e.key === "Escape") {
      e.preventDefault();
      setEditingDesc(false);
      onEditDescriptionRequestHandled?.();
    }
  };

  // ── Tag editing ──
  const [editingTags, setEditingTags] = useState(false);
  const [tagsValue, setTagsValue] = useState<string[]>([]);
  const tagsRef = useRef<string[]>([]);

  const startEditTags = () => {
    if (!onEdit) return;
    setTagsValue([...timer.tags]);
    tagsRef.current = [...timer.tags];
    setEditingTags(true);
  };

  const saveTags = (newTags: string[]) => {
    setTagsValue(newTags);
    tagsRef.current = newTags;
  };

  const commitTags = () => {
    setEditingTags(false);
    const current = tagsRef.current;
    const before = timer.tags.map((t) => t.toLowerCase()).sort().join(",");
    const after = current.map((t) => t.toLowerCase()).sort().join(",");
    if (before !== after) {
      onEdit?.(timer.id, { tags: current });
    }
  };

  // ── Begin time editing ──
  const [editingBegin, setEditingBegin] = useState(false);
  const [beginValue, setBeginValue] = useState("");
  const [beginError, setBeginError] = useState("");
  const startEditBegin = () => {
    if (!onEdit) return;
    setBeginValue(toDateTimeLocalInput(timer.beginIso));
    setBeginError("");
    setEditingBegin(true);
  };

  const saveBegin = () => {
    const d = new Date(beginValue);
    if (isNaN(d.getTime())) {
      setBeginError(t("timer.invalidTime"));
      return;
    }
    if (d.getTime() > Date.now()) {
      setBeginError(t("timer.futureTime"));
      return;
    }
    setEditingBegin(false);
    setBeginError("");
    // Kimai interprets the sent wall-clock in the user's timezone; send local
    // (not UTC) so the edited start time is not shifted by the UTC offset.
    const begin = toKimaiLocal(d);
    if (begin !== timer.beginIso) {
      onEdit?.(timer.id, { begin });
    }
  };


  // Reset editing when timer changes
  useEffect(() => {
    setEditingDesc(false);
    setEditingTags(false);
    setEditingBegin(false);
    setBeginError("");
  }, [timer.id]);

  const handledEditDescriptionRequestRef = useRef(0);
  useEffect(() => {
    if (editDescriptionRequest <= 0) {
      handledEditDescriptionRequestRef.current = 0;
      return;
    }
    if (
      !onEdit ||
      handledEditDescriptionRequestRef.current === editDescriptionRequest
    ) {
      return;
    }
    handledEditDescriptionRequestRef.current = editDescriptionRequest;
    setDescValue(timer.description);
    setEditingDesc(true);
  }, [editDescriptionRequest, onEdit, timer.description]);

  const exiting = isStopping || isPausing;
  const cardAnim = exiting ? "animate-card-out" : "animate-card-in";

  if (compact) {
    return (
      <div key={timer.id} className={`mx-3 mt-1.5 rounded-lg bg-emerald-50/70 dark:bg-emerald-950/30 border border-emerald-200/60 dark:border-emerald-800/40 ${cardAnim}`}>
        <div className="flex min-h-5 items-center gap-2 px-2.5 py-1.5">
          <ColorDots
            activityColor={timer.activityColor}
            projectColor={timer.projectColor}
            customerColor={timer.customerColor}
            colorMode={colorMode}
            pulse
          />
          {editingDesc ? (
            <input
              ref={descRef}
              type="text"
              value={descValue}
              onChange={(e) => setDescValue(e.target.value)}
              onBlur={saveDesc}
              onKeyDown={handleDescKey}
              placeholder={t("timer.addNote")}
              className="min-w-0 flex-1 rounded border border-emerald-300 bg-white px-1.5 py-0.5 text-[11px] text-gray-700 placeholder:text-gray-400 focus:outline-none focus:ring-1 focus:ring-emerald-400 dark:border-emerald-700 dark:bg-gray-800 dark:text-gray-300 dark:placeholder:text-gray-500"
            />
          ) : (
            <>
              <span className="text-[11px] font-medium text-gray-800 dark:text-gray-200 truncate">
                {timer.project}
              </span>
              <span className="text-[10px] text-gray-400 dark:text-gray-500 truncate">
                {timer.activity}
              </span>
            </>
          )}
          <span className="ml-auto text-[13px] font-mono font-semibold tabular-nums text-emerald-700 dark:text-emerald-400 tracking-tight shrink-0">
            {formatElapsed(elapsed)}
          </span>
          {onPause && (
            <button
              type="button"
              onClick={onPause}
              disabled={!!isPausing || !!isStopping}
              title={t("pause.pause")}
              aria-label={t("pause.pause")}
              className="p-1 rounded-md bg-amber-500/10 text-amber-600 dark:text-amber-400 hover:bg-amber-500/20 disabled:opacity-50 transition-colors focus:outline-none focus-visible:ring-1 focus-visible:ring-amber-400"
            >
              {isPausing ? (
                <div className="h-3 w-3 animate-spin rounded-full border-2 border-amber-400/30 border-t-amber-500" />
              ) : (
                <svg className="h-3 w-3" viewBox="0 0 24 24" fill="currentColor"><rect x="5" y="4" width="5" height="16" rx="1" /><rect x="14" y="4" width="5" height="16" rx="1" /></svg>
              )}
            </button>
          )}
          <button
            type="button"
            onClick={onStop}
            disabled={!!isStopping || !!isPausing}
            title={t("timer.stopTimer")}
            aria-label={t("timer.stopTimer")}
            className="p-1 rounded-md bg-red-500/10 text-red-600 dark:text-red-400 hover:bg-red-500/20 disabled:opacity-50 transition-colors focus:outline-none focus-visible:ring-1 focus-visible:ring-red-400"
          >
            {isStopping ? (
              <div className="h-3 w-3 animate-spin rounded-full border-2 border-red-400/30 border-t-red-500" />
            ) : (
              <svg className="h-3 w-3" viewBox="0 0 24 24" fill="currentColor"><rect x="4" y="4" width="16" height="16" rx="2" /></svg>
            )}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div key={timer.id} className={`mx-3 mt-2 rounded-lg bg-emerald-50/70 dark:bg-emerald-950/30 border border-emerald-200/60 dark:border-emerald-800/40 ${cardAnim}`}>
      <div className="px-3 py-2.5">
        {/* Row 1: Project + Activity + badges */}
        <div className="flex items-center gap-2 mb-1">
          <ColorDots
            activityColor={timer.activityColor}
            projectColor={timer.projectColor}
            customerColor={timer.customerColor}
            colorMode={colorMode}
            pulse
          />
          <span className="text-xs font-medium text-gray-800 dark:text-gray-200 truncate">
            {timer.project}
          </span>
          <span className="text-[10px] text-gray-400 dark:text-gray-500">
            {timer.activity}
          </span>
          {(multipleActive || isSaving || timeEstimate != null) && (
            <div className="ml-auto flex items-center gap-1.5 shrink-0">
              {multipleActive && (
                <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[9px] font-medium text-amber-700 dark:bg-amber-900/40 dark:text-amber-400">
                  {t("common.more")}
                </span>
              )}
              {isSaving && (
                <span className="text-[9px] text-emerald-500 dark:text-emerald-400 animate-pulse">
                  {t("common.saving")}
                </span>
              )}
              {timeEstimate != null && (() => {
                const consumed = (timeSpent ?? 0) + elapsed;
                const over = consumed > timeEstimate;
                return (
                  <span
                    title={t("integrations.timeBudgetTooltip", {
                      spent: formatBudget(consumed),
                      estimate: formatBudget(timeEstimate),
                    })}
                    className={`rounded px-1.5 py-0.5 text-[9px] font-medium tabular-nums ${
                      over
                        ? "bg-red-500/10 text-red-600 dark:text-red-400"
                        : "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
                    }`}
                  >
                    {formatBudget(consumed)} / {formatBudget(timeEstimate)}
                  </span>
                );
              })()}
            </div>
          )}
        </div>

        {/* Row 2: Description (editable) */}
        {showNote && (
          <div className="pl-4 mb-1.5 flex items-center gap-1">
            <div className="min-w-0 flex-1">
              {editingDesc ? (
                <input
                  ref={descRef}
                  type="text"
                  value={descValue}
                  onChange={(e) => setDescValue(e.target.value)}
                  onBlur={saveDesc}
                  onKeyDown={handleDescKey}
                  placeholder={t("timer.addNote")}
                  className="w-full text-[11px] bg-white dark:bg-gray-800 border border-emerald-300 dark:border-emerald-700 rounded px-1.5 py-0.5 text-gray-700 dark:text-gray-300 placeholder:text-gray-400 dark:placeholder:text-gray-500 focus:outline-none focus:ring-1 focus:ring-emerald-400"
                />
              ) : (
                <button
                  type="button"
                  onClick={startEditDesc}
                  disabled={!onEdit}
                  className={`block w-full text-left text-[11px] truncate focus:outline-none focus-visible:ring-1 focus-visible:ring-emerald-400 ${
                    onEdit
                      ? "cursor-text hover:bg-emerald-100/50 dark:hover:bg-emerald-900/30 rounded px-1 -mx-1 transition-colors"
                      : ""
                  } ${
                    timer.description
                      ? "text-gray-500 dark:text-gray-400"
                      : "text-gray-400 dark:text-gray-500 italic"
                  }`}
                >
                  {timer.description || t("timer.addNote")}
                </button>
              )}
            </div>
            {issueUrl && !editingDesc && (
              <button
                type="button"
                onClick={async () => {
                  const { openUrl } = await import("@tauri-apps/plugin-opener");
                  openUrl(issueUrl);
                }}
                title={t("integrations.openInBrowser")}
                className="shrink-0 p-0.5 rounded text-gray-400 dark:text-gray-500 hover:text-[var(--accent)] transition-colors focus:outline-none focus-visible:ring-1 focus-visible:ring-[var(--accent)]"
              >
                <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
                </svg>
              </button>
            )}
          </div>
        )}

        {/* Row 3: Tags */}
        {showTags && (
          <div className="pl-4 mb-1.5">
            {editingTags ? (
              <div onBlur={(e) => {
                if (!e.currentTarget.contains(e.relatedTarget as Node)) {
                  commitTags();
                }
              }}>
                <TagsInput tags={tagsValue} onChange={saveTags} onCommit={commitTags} suggestions={tagSuggestions} />
              </div>
            ) : timer.tags.length > 0 ? (
              <button
                type="button"
                onClick={startEditTags}
                disabled={!onEdit}
                className={`block w-full text-left focus:outline-none focus-visible:ring-1 focus-visible:ring-emerald-400 ${onEdit ? "cursor-pointer hover:bg-emerald-100/50 dark:hover:bg-emerald-900/30 rounded px-1 -mx-1 py-0.5 transition-colors" : ""}`}
              >
                <TagsList tags={timer.tags} maxVisible={3} />
              </button>
            ) : onEdit ? (
              <button
                type="button"
                onClick={startEditTags}
                className="block w-full text-left text-[10px] text-gray-400 dark:text-gray-500 italic cursor-text hover:bg-emerald-100/50 dark:hover:bg-emerald-900/30 rounded px-1 -mx-1 transition-colors focus:outline-none focus-visible:ring-1 focus-visible:ring-emerald-400"
              >
                {t("tags.addTags")}
              </button>
            ) : null}
          </div>
        )}

        {/* Row 4: Elapsed + start time + stop */}
        <div className="flex items-center justify-between pl-4">
          <div className="flex items-baseline gap-2 min-w-0">
            <span className={`${focusMode ? "text-2xl" : "text-lg"} font-mono font-semibold tabular-nums text-emerald-700 dark:text-emerald-400 tracking-tight shrink-0`}>
              {formatElapsed(elapsed)}
            </span>
            {editingBegin ? (
              <div className="flex flex-col min-w-0">
                <DateTimePicker
                  value={beginValue}
                  onChange={(v) => {
                    setBeginValue(v);
                    setBeginError("");
                  }}
                  onClose={saveBegin}
                  compact
                  className="text-[10px] bg-white dark:bg-gray-800 border border-emerald-300 dark:border-emerald-700 rounded px-1.5 py-0.5 text-gray-700 dark:text-gray-300 focus:outline-none focus:ring-1 focus:ring-emerald-400 flex items-center gap-1.5 cursor-pointer"
                />
                {beginError && (
                  <span className="text-[9px] text-red-500 mt-0.5">
                    {beginError}
                  </span>
                )}
              </div>
            ) : (
              <button
                type="button"
                onClick={startEditBegin}
                disabled={!onEdit}
                className="text-[10px] text-gray-400 dark:text-gray-500 hover:text-emerald-600 dark:hover:text-emerald-400 transition-colors disabled:hover:text-gray-400 dark:disabled:hover:text-gray-500 shrink-0"
              >
                {t("common.since", { time: formatStartTime(timer.beginIso) })}
              </button>
            )}
          </div>
          <div className="flex items-center gap-1.5 shrink-0 ml-2">
            {onPause && (
              <button
                type="button"
                onClick={onPause}
                disabled={!!isPausing || !!isStopping}
                title={t("pause.pause")}
                aria-label={t("pause.pause")}
                className="p-1.5 rounded-md
                  bg-amber-500/10 text-amber-600 dark:text-amber-400
                  hover:bg-amber-500/20 active:bg-amber-500/30
                  disabled:opacity-50 disabled:cursor-not-allowed
                  transition-colors focus:outline-none focus-visible:ring-1 focus-visible:ring-amber-400"
              >
                {isPausing ? (
                  <div className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-amber-400/30 border-t-amber-500" />
                ) : (
                  <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="currentColor"><rect x="5" y="4" width="5" height="16" rx="1" /><rect x="14" y="4" width="5" height="16" rx="1" /></svg>
                )}
              </button>
            )}
            <button
              type="button"
              onClick={onStop}
              disabled={!!isStopping || !!isPausing}
              title={t("timer.stopTimer")}
              aria-label={t("timer.stopTimer")}
              className="p-1.5 rounded-md
                bg-red-500/10 text-red-600 dark:text-red-400
                hover:bg-red-500/20 active:bg-red-500/30
                disabled:opacity-50 disabled:cursor-not-allowed
                transition-colors focus:outline-none focus-visible:ring-1 focus-visible:ring-red-400"
            >
              {isStopping ? (
                <div className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-red-400/30 border-t-red-500" />
              ) : (
                <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="currentColor"><rect x="4" y="4" width="16" height="16" rx="2" /></svg>
              )}
            </button>
          </div>
        </div>

        {/* Save error */}
        {saveError && (
          <p role="alert" className="pl-4 mt-1.5 text-[10px] text-red-500 dark:text-red-400 truncate">
            {saveError}
          </p>
        )}
      </div>
    </div>
  );
}

export { formatElapsed };
