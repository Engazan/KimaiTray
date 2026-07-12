import { useTranslation } from "react-i18next";
import { Window } from "@tauri-apps/api/window";

interface EmptyTimerStateProps {
  variant?: "empty" | "loading" | "unconfigured";
  compact?: boolean;
}

async function openConnectionSettings() {
  const w = await Window.getByLabel("settings");
  if (w) {
    await w.show();
    await w.setFocus();
    await w.emitTo("settings", "kimai://navigate-section", "connection");
  }
}

export default function EmptyTimerState({
  variant = "empty",
  compact,
}: EmptyTimerStateProps) {
  const { t } = useTranslation();

  if (compact) {
    return (
      <div className="mx-3 mt-1.5 rounded-lg border border-dashed border-gray-200 dark:border-gray-700 px-2.5 py-1.5 animate-card-in">
        <div className="flex min-h-5 items-center gap-2">
          {variant === "loading" ? (
            <>
              <div className="h-3 w-3 animate-spin rounded-full border-2 border-gray-200 dark:border-gray-600 shrink-0" style={{ borderTopColor: "var(--accent)" }} />
              <span className="text-[11px] text-gray-400 dark:text-gray-500">{t("common.loading")}</span>
            </>
          ) : variant === "unconfigured" ? (
            <button
              type="button"
              onClick={openConnectionSettings}
              className="flex items-center gap-2 hover:opacity-80 transition-opacity"
            >
              <svg className="h-3 w-3 text-gray-300 dark:text-gray-600 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M13.19 8.688a4.5 4.5 0 011.242 7.244l-4.5 4.5a4.5 4.5 0 01-6.364-6.364l1.757-1.757m9.86-2.06a4.5 4.5 0 00-1.242-7.244l-4.5-4.5a4.5 4.5 0 00-6.364 6.364L4.34 8.798" />
              </svg>
              <span className="text-[11px] text-gray-400 dark:text-gray-500">{t("tray.setupConnection")}</span>
            </button>
          ) : (
            <>
              <svg className="h-3 w-3 text-gray-300 dark:text-gray-600 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6l4 2m6-2a10 10 0 11-20 0 10 10 0 0120 0z" />
              </svg>
              <span className="text-[11px] text-gray-400 dark:text-gray-500">{t("tray.noActiveTimer")}</span>
            </>
          )}
        </div>
      </div>
    );
  }

  if (variant === "loading") {
    return (
      <div className="mx-3 mt-2 rounded-lg border border-gray-200 dark:border-gray-700 px-3 py-4 animate-card-in">
        <div className="flex flex-col items-center gap-1.5">
          <div className="h-5 w-5 animate-spin rounded-full border-2 border-gray-200 dark:border-gray-600" style={{ borderTopColor: "var(--accent)" }} />
          <span className="text-xs text-gray-400 dark:text-gray-500">
            {t("common.loading")}
          </span>
        </div>
      </div>
    );
  }

  if (variant === "unconfigured") {
    return (
      <div className="mx-3 mt-2 rounded-lg border border-dashed border-gray-200 dark:border-gray-700 px-3 py-4 animate-card-in">
        <div className="flex flex-col items-center gap-1.5">
          <svg
            className="h-5 w-5 text-gray-300 dark:text-gray-600"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={1.5}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M13.19 8.688a4.5 4.5 0 011.242 7.244l-4.5 4.5a4.5 4.5 0 01-6.364-6.364l1.757-1.757m9.86-2.06a4.5 4.5 0 00-1.242-7.244l-4.5-4.5a4.5 4.5 0 00-6.364 6.364L4.34 8.798"
            />
          </svg>
          <span className="text-xs font-medium text-gray-400 dark:text-gray-500">
            {t("tray.notConnected")}
          </span>
          <button
            type="button"
            onClick={openConnectionSettings}
            className="mt-0.5 rounded-md px-3 py-1 text-[11px] font-medium text-white transition-colors"
            style={{ backgroundColor: "var(--accent)" }}
            onMouseEnter={(e) => (e.currentTarget.style.opacity = "0.85")}
            onMouseLeave={(e) => (e.currentTarget.style.opacity = "1")}
          >
            {t("tray.setupConnection")}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-3 mt-2 rounded-lg border border-dashed border-gray-200 dark:border-gray-700 px-3 py-4 animate-card-in">
      <div className="flex flex-col items-center gap-1">
        <svg
          className="h-5 w-5 text-gray-300 dark:text-gray-600"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={1.5}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M12 6v6l4 2m6-2a10 10 0 11-20 0 10 10 0 0120 0z"
          />
        </svg>
        <span className="text-xs font-medium text-gray-400 dark:text-gray-500">
          {t("tray.noActiveTimer")}
        </span>
        <span className="text-[10px] text-gray-300 dark:text-gray-600">
          {t("tray.startHint")}
        </span>
      </div>
    </div>
  );
}
