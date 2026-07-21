import { useEffect, useId, useMemo, useRef, type ReactNode } from "react";
import { openUrl } from "@tauri-apps/plugin-opener";
import { useTranslation } from "react-i18next";

interface Props {
  version: string;
  body: string;
  onClose: () => void;
  standalone?: boolean;
}

function renderInlineMarkdown(value: string): ReactNode[] {
  return value
    .split(/(\*\*[^*]+\*\*|\[[^\]]+\]\(https?:\/\/[^)]+\))/g)
    .filter(Boolean)
    .map((part, index) => {
      const bold = /^\*\*(.+)\*\*$/.exec(part);
      if (bold) return <strong key={index}>{bold[1]}</strong>;

      const link = /^\[([^\]]+)\]\((https?:\/\/[^)]+)\)$/.exec(part);
      if (link) {
        return (
          <button
            key={index}
            type="button"
            onClick={() => void openUrl(link[2]).catch(() => {})}
            className="inline text-left font-medium text-[var(--accent)] underline decoration-current/30 underline-offset-2 hover:decoration-current focus:outline-none focus-visible:ring-1 focus-visible:ring-[var(--accent)]"
          >
            {link[1]}
          </button>
        );
      }
      return part;
    });
}

function MarkdownChangelog({ body }: { body: string }) {
  const blocks = useMemo(() => {
    const result: ReactNode[] = [];
    const lines = body.split(/\r?\n/);
    let list: string[] = [];

    const flushList = () => {
      if (list.length === 0) return;
      const items = list;
      list = [];
      result.push(
        <ul key={`list-${result.length}`} className="ml-4 list-disc space-y-1.5 text-[12px] leading-5 text-gray-600 marker:text-gray-300 dark:text-gray-300 dark:marker:text-gray-600">
          {items.map((item, index) => (
            <li key={index}>{renderInlineMarkdown(item)}</li>
          ))}
        </ul>,
      );
    };

    for (const rawLine of lines) {
      const line = rawLine.trim();
      if (!line) {
        flushList();
        continue;
      }
      if (line.startsWith("- ")) {
        list.push(line.slice(2));
        continue;
      }
      flushList();
      const heading = /^(#{1,6})\s+(.+)$/.exec(line);
      if (heading) {
        result.push(
          <h3 key={`heading-${result.length}`} className="pt-1 text-[12px] font-semibold uppercase tracking-wide text-gray-800 dark:text-gray-100">
            {renderInlineMarkdown(heading[2])}
          </h3>,
        );
      } else {
        result.push(
          <p key={`paragraph-${result.length}`} className="text-[12px] leading-5 text-gray-600 dark:text-gray-300">
            {renderInlineMarkdown(line)}
          </p>,
        );
      }
    }
    flushList();
    return result;
  }, [body]);

  return <div className="space-y-2.5">{blocks}</div>;
}

export default function ChangelogDialog({
  version,
  body,
  onClose,
  standalone = false,
}: Props) {
  const { t } = useTranslation();
  const titleId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const previouslyFocused = document.activeElement as HTMLElement | null;
    closeRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key !== "Tab") return;
      const focusable = Array.from(
        dialogRef.current?.querySelectorAll<HTMLElement>(
          "button:not(:disabled), [href], [tabindex]:not([tabindex='-1'])",
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

  return (
    <div
      className={
        standalone
          ? "fixed inset-0 z-50 flex bg-white dark:bg-[#202020]"
          : "fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-5 backdrop-blur-sm"
      }
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className={`flex w-full flex-col overflow-hidden bg-white dark:bg-[#202020] ${
          standalone
            ? "h-full"
            : "max-h-[min(680px,calc(100vh-40px))] max-w-[580px] rounded-2xl border border-gray-200 shadow-2xl dark:border-gray-700"
        }`}
      >
        <header className="flex shrink-0 items-start gap-3 border-b border-gray-100 px-5 py-4 dark:border-gray-800">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[var(--accent-light)] text-[var(--accent)]">
            <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v12m0 0 4-4m-4 4-4-4M5 19h14" />
            </svg>
          </span>
          <div className="min-w-0 flex-1">
            <h2 id={titleId} className="text-[16px] font-semibold text-gray-900 dark:text-gray-100">
              {t("changelog.title")}
            </h2>
            <p className="mt-0.5 text-[11px] text-gray-500 dark:text-gray-400">
              {t("changelog.updatedTo", { version })}
            </p>
          </div>
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            aria-label={t("changelog.close")}
            className="rounded-md p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600 focus:outline-none focus-visible:ring-1 focus-visible:ring-[var(--accent)] dark:hover:bg-gray-800 dark:hover:text-gray-200"
          >
            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" d="M6 6l12 12M18 6 6 18" />
            </svg>
          </button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4 [scrollbar-width:thin]">
          {body.trim() ? (
            <MarkdownChangelog body={body} />
          ) : (
            <p className="text-[12px] text-gray-500 dark:text-gray-400">
              {t("changelog.noDetails")}
            </p>
          )}
        </div>

        <footer className="shrink-0 border-t border-gray-100 px-5 py-3 text-right dark:border-gray-800">
          <button
            type="button"
            onClick={onClose}
            className="rounded-md bg-[var(--accent)] px-4 py-2 text-[12px] font-medium text-white hover:bg-[var(--accent-hover)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-2 dark:ring-offset-[#202020]"
          >
            {t("changelog.close")}
          </button>
        </footer>
      </div>
    </div>
  );
}
