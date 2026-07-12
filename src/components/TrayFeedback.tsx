interface UpdateBannerProps {
  downloading: boolean;
  label: string;
  onInstall: () => void;
}

export function UpdateBanner({ downloading, label, onInstall }: UpdateBannerProps) {
  return (
    <button
      onClick={onInstall}
      disabled={downloading}
      className="mx-3 mt-1.5 flex items-center gap-2 rounded-md bg-[var(--accent)]/10 border border-[var(--accent)]/20 px-2.5 py-1.5 text-[11px] text-[var(--accent)] hover:bg-[var(--accent)]/15 transition-colors disabled:opacity-60"
    >
      {downloading ? (
        <div className="h-3 w-3 animate-spin rounded-full border-2 border-[var(--accent)]/30 border-t-[var(--accent)]" />
      ) : (
        <svg
          className="h-3 w-3 shrink-0"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2.5}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3"
          />
        </svg>
      )}
      <span className="font-medium">{label}</span>
    </button>
  );
}

interface ErrorBannerProps {
  message: string;
  onDismiss: () => void;
}

export function ErrorBanner({ message, onDismiss }: ErrorBannerProps) {
  return (
    <div className="mx-3 mt-1.5 flex items-start gap-2 rounded-md bg-red-50 dark:bg-red-950/30 border border-red-200/60 dark:border-red-800/40 px-2.5 py-2">
      <span className="text-[11px] text-red-600 dark:text-red-400 flex-1 leading-snug">
        {message}
      </span>
      <button
        onClick={onDismiss}
        className="text-red-400 hover:text-red-600 dark:text-red-500 dark:hover:text-red-300 text-xs leading-none shrink-0 p-0.5"
        aria-label="Dismiss"
      >
        ✕
      </button>
    </div>
  );
}
