import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import type { ApiErrorEvent } from "../providers/QueryProvider";

export default function ApiErrorDialog() {
  const { t } = useTranslation();
  const [errors, setErrors] = useState<ApiErrorEvent[]>([]);
  const dismissRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<ApiErrorEvent>).detail;
      setErrors((prev) => [...prev.slice(-4), detail]);
    };
    window.addEventListener("kimai-api-error", handler);
    return () => window.removeEventListener("kimai-api-error", handler);
  }, []);

  useEffect(() => {
    if (errors.length === 0) return;
    dismissRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setErrors((prev) => prev.slice(1));
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [errors.length]);

  if (errors.length === 0) return null;

  const current = errors[0];

  const dismiss = () => setErrors((prev) => prev.slice(1));

  const bodyText =
    current.body && typeof current.body === "object" && current.body !== null
      ? JSON.stringify(current.body, null, 2)
      : current.body
        ? String(current.body)
        : null;

  return (
    <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="api-error-title"
        className="mx-3 w-full max-w-[320px] rounded-xl bg-white dark:bg-[#222] shadow-xl border border-gray-200 dark:border-gray-700 p-4"
      >
        <div className="flex items-center gap-2 mb-3">
          <div className="flex items-center justify-center h-8 w-8 rounded-full bg-red-100 dark:bg-red-900/30 shrink-0">
            <svg
              className="h-4 w-4 text-red-600 dark:text-red-400"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z"
              />
            </svg>
          </div>
          <div className="min-w-0">
            <h3 id="api-error-title" className="text-[13px] font-semibold text-gray-900 dark:text-gray-100">
              {t("errors.apiErrorTitle")}
            </h3>
            <p className="text-[11px] text-gray-500 dark:text-gray-400">
              {current.message}
            </p>
          </div>
        </div>

        <div className="mb-3 space-y-1.5">
          {current.endpoint && (
            <div className="rounded-md bg-gray-50 dark:bg-gray-800/50 px-3 py-2">
              <p className="text-[10px] font-medium text-gray-400 dark:text-gray-500 uppercase tracking-wider">
                {t("errors.endpoint")}
              </p>
              <p className="text-[12px] font-mono font-medium text-red-600 dark:text-red-400 break-all">
                {current.endpoint}
              </p>
            </div>
          )}

          <div className="rounded-md bg-gray-50 dark:bg-gray-800/50 px-3 py-2">
            <p className="text-[10px] font-medium text-gray-400 dark:text-gray-500 uppercase tracking-wider">
              {t("errors.statusCode")}
            </p>
            <p className="text-[12px] font-mono font-medium text-gray-900 dark:text-gray-100">
              {current.status} {current.statusText}
            </p>
          </div>

          {bodyText && (
            <div className="rounded-md bg-gray-50 dark:bg-gray-800/50 px-3 py-2">
              <p className="text-[10px] font-medium text-gray-400 dark:text-gray-500 uppercase tracking-wider">
                {t("errors.serverResponse")}
              </p>
              <pre className="text-[11px] font-mono text-gray-700 dark:text-gray-300 whitespace-pre-wrap break-all max-h-[120px] overflow-y-auto mt-0.5">
                {bodyText}
              </pre>
            </div>
          )}
        </div>

        <button
          ref={dismissRef}
          onClick={dismiss}
          className="w-full rounded-md px-3 py-2 text-[12px] font-medium transition-colors focus:outline-none focus-visible:ring-1 focus-visible:ring-blue-400 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200 hover:bg-gray-200 dark:hover:bg-gray-600"
        >
          {t("errors.dismiss")}
          {errors.length > 1 && (
            <span className="ml-1 text-gray-400 dark:text-gray-500">
              ({errors.length - 1} {t("common.more")})
            </span>
          )}
        </button>
      </div>
    </div>
  );
}
