import { useTranslation } from "react-i18next";

interface PopupFooterActionsProps {
  onNewTask: () => void;
  showOpenKimai?: boolean;
  onOpenKimai: () => void;
  onSettings: () => void;
}

export default function PopupFooterActions({
  onNewTask,
  showOpenKimai = true,
  onOpenKimai,
  onSettings,
}: PopupFooterActionsProps) {
  const { t } = useTranslation();
  const btnBase =
    "flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-[11px] font-medium transition-colors focus:outline-none focus-visible:ring-1 focus-visible:ring-blue-400";

  return (
    <footer className="flex items-center gap-1 border-t border-gray-100 dark:border-gray-800 px-2 py-1.5">
      <button
        type="button"
        onClick={onNewTask}
        className={`${btnBase} text-[var(--accent)] hover:bg-[var(--accent-light)]`}
      >
        <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
        </svg>
        {t("tray.newTask")}
      </button>

      {showOpenKimai && (
        <button
          type="button"
          onClick={onOpenKimai}
          className={`${btnBase} text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800`}
        >
          <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25"
            />
          </svg>
          {t("common.openKimai")}
        </button>
      )}

      <div className="flex-1" />

      <button
        type="button"
        onClick={onSettings}
        title={t("common.settings")}
        aria-label={t("common.settings")}
        className={`${btnBase} text-gray-400 dark:text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800`}
      >
        <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.325.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.241-.438.613-.43.992a7.723 7.723 0 010 .255c-.008.378.137.75.43.991l1.004.827c.424.35.534.955.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.47 6.47 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.281c-.09.543-.56.94-1.11.94h-2.594c-.55 0-1.019-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.991a6.932 6.932 0 010-.255c.007-.38-.138-.751-.43-.992l-1.004-.827a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.086.22-.128.332-.183.582-.495.644-.869l.214-1.28z"
          />
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
        </svg>
      </button>
    </footer>
  );
}
