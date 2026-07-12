import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import type { ConnectionStatus } from "../hooks/useActiveTimer";
import type { SavedConnection } from "../types";

interface HeaderStatusProps {
  status: ConnectionStatus;
  errorMessage?: string;
  connections: SavedConnection[];
  activeConnectionId: string;
  onSwitchConnection: (id: string) => Promise<void>;
}

const DOT_STYLES: Record<ConnectionStatus, string> = {
  connected: "bg-emerald-500 shadow-[0_0_4px_rgba(16,185,129,0.6)]",
  loading: "bg-amber-400 animate-pulse",
  error: "bg-red-500",
  offline: "bg-gray-300 dark:bg-gray-600",
  unconfigured: "bg-gray-300 dark:bg-gray-600",
};

const STATUS_LABEL_KEYS: Record<ConnectionStatus, string | null> = {
  connected: null,
  loading: "status.connecting",
  error: "status.error",
  offline: "status.offline",
  unconfigured: "status.notConfigured",
};

export default function HeaderStatus({
  status,
  errorMessage,
  connections,
  activeConnectionId,
  onSwitchConnection,
}: HeaderStatusProps) {
  const { t } = useTranslation();
  const labelKey = STATUS_LABEL_KEYS[status];
  const label = errorMessage || (labelKey ? t(labelKey) : "");
  const active = connections.find((c) => c.id === activeConnectionId);
  const hasMultiple = connections.length > 1;

  return (
    <header className="flex items-center justify-between px-3 py-2 border-b border-gray-100 dark:border-gray-800">
      <div className="flex items-center gap-2 min-w-0">
        <span
          className={`inline-block h-1.5 w-1.5 shrink-0 rounded-full ${DOT_STYLES[status]}`}
        />
        {hasMultiple ? (
          <ConnectionSwitcher
            connections={connections}
            activeId={activeConnectionId}
            onSwitch={onSwitchConnection}
          />
        ) : (
          <span className="text-[11px] font-semibold tracking-wide text-gray-500 dark:text-gray-400 uppercase truncate">
            {active?.name ?? "KimaiTray"}
          </span>
        )}
      </div>
      {label && (
        <span
          className={`text-[10px] truncate max-w-[180px] shrink-0 ${
            status === "error"
              ? "text-red-500"
              : "text-gray-400 dark:text-gray-500"
          }`}
        >
          {label}
        </span>
      )}
    </header>
  );
}

function ConnectionSwitcher({
  connections,
  activeId,
  onSwitch,
}: {
  connections: SavedConnection[];
  activeId: string;
  onSwitch: (id: string) => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const active = connections.find((c) => c.id === activeId);

  const handleClickOutside = useCallback((e: MouseEvent) => {
    if (ref.current && !ref.current.contains(e.target as Node)) {
      setOpen(false);
    }
  }, []);

  useEffect(() => {
    if (open) {
      document.addEventListener("mousedown", handleClickOutside);
      return () => document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [open, handleClickOutside]);

  return (
    <div ref={ref} className="relative min-w-0">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1 text-[11px] font-semibold tracking-wide text-gray-500 dark:text-gray-400 uppercase truncate
          hover:text-gray-700 dark:hover:text-gray-300 transition-colors"
      >
        <span className="truncate">{active?.name ?? "KimaiTray"}</span>
        <svg
          className={`h-3 w-3 shrink-0 transition-transform ${open ? "rotate-180" : ""}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
        </svg>
      </button>

      {open && (
        <div className="absolute left-0 top-full z-50 mt-1.5 min-w-[180px] overflow-hidden rounded-md border border-gray-200 bg-white shadow-lg dark:border-gray-700 dark:bg-[#1e1e1e]">
          {connections.map((conn) => (
            <button
              key={conn.id}
              type="button"
              onClick={() => {
                void onSwitch(conn.id);
                setOpen(false);
              }}
              className={`flex w-full items-center gap-2 px-3 py-1.5 text-[11px] transition-colors
                ${
                  conn.id === activeId
                    ? "bg-[var(--accent-light)] text-[var(--accent)] font-medium"
                    : "text-gray-600 hover:bg-gray-50 dark:text-gray-400 dark:hover:bg-gray-800"
                }`}
            >
              <span
                className={`h-1.5 w-1.5 shrink-0 rounded-full ${
                  conn.id === activeId
                    ? "bg-emerald-500"
                    : "bg-gray-300 dark:bg-gray-600"
                }`}
              />
              <span className="truncate">{conn.name}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
