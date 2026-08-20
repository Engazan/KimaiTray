import { useEffect, useId, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { KimaiApiError } from "../api/kimaiClient";
import type { KimaiActivityCreate } from "../api/kimaiTypes";

interface ActivityCreateDialogProps {
  projectId: number;
  projectName: string;
  onCreate: (payload: KimaiActivityCreate) => Promise<void>;
  onClose: () => void;
}

type ActivityScope = "local" | "global";

function normalizeHexColor(value: string): string | null {
  const hex = value.trim().replace(/^#/, "").toLowerCase();
  return /^[0-9a-f]{6}$/.test(hex) ? `#${hex}` : null;
}

function createErrorMessage(
  error: unknown,
  t: ReturnType<typeof useTranslation>["t"],
): string {
  if (error instanceof KimaiApiError && error.code === "forbidden") {
    return t("newTask.createActivityForbidden");
  }
  if (error instanceof KimaiApiError && error.code === "unauthorized") {
    return t("errors.unauthorized");
  }
  return error instanceof Error && error.message
    ? error.message
    : t("newTask.createActivityFailed");
}

export default function ActivityCreateDialog({
  projectId,
  projectName,
  onCreate,
  onClose,
}: ActivityCreateDialogProps) {
  const { t } = useTranslation();
  const titleId = useId();
  const nameId = useId();
  const colorId = useId();
  const hexId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);
  const nameRef = useRef<HTMLInputElement>(null);
  const isCreatingRef = useRef(false);
  const [scope, setScope] = useState<ActivityScope>("local");
  const [name, setName] = useState("");
  const [automaticColor, setAutomaticColor] = useState(true);
  const [color, setColor] = useState("#3b82f6");
  const [error, setError] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);

  useEffect(() => {
    isCreatingRef.current = isCreating;
  }, [isCreating]);

  useEffect(() => {
    const previouslyFocused = document.activeElement as HTMLElement | null;
    nameRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented) return;
      if (event.key === "Escape") {
        event.preventDefault();
        if (!isCreatingRef.current) onClose();
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

  const normalizedColor = normalizeHexColor(color);
  const canCreate =
    name.trim().length > 0 &&
    (automaticColor || normalizedColor !== null) &&
    !isCreating;

  const submit = async () => {
    if (!canCreate) return;
    setError(null);
    setIsCreating(true);
    const payload: KimaiActivityCreate = {
      name: name.trim(),
      ...(scope === "local" ? { project: projectId } : {}),
      ...(!automaticColor && normalizedColor
        ? { color: normalizedColor }
        : {}),
      visible: true,
      billable: true,
    };
    try {
      await onCreate(payload);
      onClose();
    } catch (createError) {
      setError(createErrorMessage(createError, t));
    } finally {
      setIsCreating(false);
    }
  };

  const updateScope = (nextScope: ActivityScope) => {
    setScope(nextScope);
    setError(null);
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
              {t("newTask.createActivity")}
            </h2>
            <p className="mt-0.5 truncate text-[11px] text-gray-500 dark:text-gray-400">
              {projectName}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={isCreating}
            aria-label={t("common.cancel")}
            className="rounded-md p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600 focus:outline-none focus-visible:ring-1 focus-visible:ring-[var(--accent)] disabled:opacity-40 dark:hover:bg-gray-800 dark:hover:text-gray-200"
          >
            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" d="M6 6l12 12M18 6 6 18" />
            </svg>
          </button>
        </header>

        <form
          onSubmit={(event) => {
            event.preventDefault();
            void submit();
          }}
        >
          <div className="space-y-3 px-4 py-3">
            <div>
              <span className="mb-1 block text-[10px] font-medium uppercase tracking-wide text-gray-400 dark:text-gray-500">
                {t("newTask.activityScope")}
              </span>
              <div
                role="radiogroup"
                aria-label={t("newTask.activityScope")}
                className="grid grid-cols-2 gap-1 rounded-lg bg-gray-100 p-1 dark:bg-gray-800"
              >
                {(["local", "global"] as const).map((option) => (
                  <button
                    key={option}
                    type="button"
                    role="radio"
                    aria-checked={scope === option}
                    disabled={isCreating}
                    onClick={() => updateScope(option)}
                    className={`rounded-md px-3 py-1.5 text-[11px] font-medium transition-colors focus:outline-none focus-visible:ring-1 focus-visible:ring-[var(--accent)] ${
                      scope === option
                        ? "bg-white text-gray-800 shadow-sm dark:bg-gray-700 dark:text-gray-100"
                        : "text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
                    }`}
                  >
                    {t(
                      option === "local"
                        ? "newTask.localActivities"
                        : "newTask.globalActivities",
                    )}
                  </button>
                ))}
              </div>
              <p className="mt-1 text-[10px] leading-4 text-gray-400 dark:text-gray-500">
                {t(
                  scope === "local"
                    ? "newTask.localActivityHint"
                    : "newTask.globalActivityHint",
                  { project: projectName },
                )}
              </p>
            </div>

            <div>
              <label
                htmlFor={nameId}
                className="mb-1 block text-[10px] font-medium uppercase tracking-wide text-gray-400 dark:text-gray-500"
              >
                {t("newTask.activityName")}
              </label>
              <input
                ref={nameRef}
                id={nameId}
                type="text"
                value={name}
                maxLength={150}
                disabled={isCreating}
                onChange={(event) => {
                  setName(event.target.value);
                  setError(null);
                }}
                placeholder={t("newTask.activityNamePlaceholder")}
                className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-[13px] text-gray-700 placeholder:text-gray-400 focus:border-[var(--accent)] focus:outline-none focus:ring-1 focus:ring-[var(--accent)] disabled:opacity-40 dark:border-white/20 dark:bg-white/[0.08] dark:text-gray-300 dark:placeholder:text-gray-500"
              />
            </div>

            <div>
              <span className="mb-1 block text-[10px] font-medium uppercase tracking-wide text-gray-400 dark:text-gray-500">
                {t("newTask.activityColor")}
              </span>
              <div
                role="radiogroup"
                aria-label={t("newTask.activityColor")}
                className="grid grid-cols-2 gap-1 rounded-lg bg-gray-100 p-1 dark:bg-gray-800"
              >
                <button
                  type="button"
                  role="radio"
                  aria-checked={automaticColor}
                  disabled={isCreating}
                  onClick={() => {
                    setAutomaticColor(true);
                    setError(null);
                  }}
                  className={`rounded-md px-3 py-1.5 text-[11px] font-medium transition-colors focus:outline-none focus-visible:ring-1 focus-visible:ring-[var(--accent)] ${
                    automaticColor
                      ? "bg-white text-gray-800 shadow-sm dark:bg-gray-700 dark:text-gray-100"
                      : "text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
                  }`}
                >
                  {t("newTask.automaticColor")}
                </button>
                <button
                  type="button"
                  role="radio"
                  aria-checked={!automaticColor}
                  disabled={isCreating}
                  onClick={() => {
                    setAutomaticColor(false);
                    setError(null);
                  }}
                  className={`rounded-md px-3 py-1.5 text-[11px] font-medium transition-colors focus:outline-none focus-visible:ring-1 focus-visible:ring-[var(--accent)] ${
                    !automaticColor
                      ? "bg-white text-gray-800 shadow-sm dark:bg-gray-700 dark:text-gray-100"
                      : "text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
                  }`}
                >
                  {t("newTask.customColor")}
                </button>
              </div>
              {automaticColor ? (
                <p className="mt-1 text-[10px] leading-4 text-gray-400 dark:text-gray-500">
                  {t("newTask.automaticColorHint")}
                </p>
              ) : (
                <div className="mt-2 flex items-center gap-2">
                  <label
                    htmlFor={colorId}
                    className="relative h-9 w-9 shrink-0 cursor-pointer overflow-hidden rounded-lg border border-gray-200 dark:border-gray-600"
                    style={{ backgroundColor: normalizedColor ?? "#3b82f6" }}
                    title={normalizedColor ?? undefined}
                  >
                    <span className="sr-only">{t("newTask.chooseColor")}</span>
                    <input
                      id={colorId}
                      type="color"
                      value={normalizedColor ?? "#3b82f6"}
                      disabled={isCreating}
                      onChange={(event) => setColor(event.target.value)}
                      className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
                    />
                  </label>
                  <div className="relative flex-1">
                    <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-[12px] text-gray-400">
                      #
                    </span>
                    <input
                      id={hexId}
                      type="text"
                      aria-label={t("newTask.hexColor")}
                      value={color.replace(/^#/, "")}
                      maxLength={6}
                      spellCheck={false}
                      disabled={isCreating}
                      onChange={(event) => {
                        setColor(event.target.value);
                        setError(null);
                      }}
                      className={`w-full rounded-lg border bg-transparent py-2 pl-6 pr-2 text-[12px] font-mono uppercase tracking-wide focus:outline-none focus:ring-1 focus:ring-[var(--accent)] disabled:opacity-40 ${
                        normalizedColor
                          ? "border-gray-300 dark:border-gray-600"
                          : "border-red-300 dark:border-red-700"
                      }`}
                    />
                  </div>
                </div>
              )}
            </div>

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
              type="button"
              onClick={onClose}
              disabled={isCreating}
              className="rounded-md px-3 py-1.5 text-[11px] font-medium text-gray-500 hover:bg-gray-100 focus:outline-none focus-visible:ring-1 focus-visible:ring-[var(--accent)] disabled:opacity-40 dark:text-gray-400 dark:hover:bg-gray-800"
            >
              {t("common.cancel")}
            </button>
            <button
              type="submit"
              disabled={!canCreate}
              className="rounded-md bg-[var(--accent)] px-3.5 py-1.5 text-[11px] font-medium text-white hover:bg-[var(--accent-hover)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-2 disabled:opacity-40 dark:ring-offset-[#202020]"
            >
              {isCreating
                ? t("newTask.creatingActivity")
                : t("newTask.createActivityAction")}
            </button>
          </footer>
        </form>
      </div>
    </div>
  );
}
