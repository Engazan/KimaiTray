import { useCallback, useEffect, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import type { AppSettings, SavedConnection } from "../types";
import { testConnection, isInsecureUrl, type ConnectionResult } from "../api";
import { getConnectionToken } from "../api/connectionTokenStore";
import IntegrationsSection from "./IntegrationsSection";
import {
  Divider,
  FieldGroup,
  SectionDescription,
  SectionTitle,
  TextInput,
} from "./Controls";

interface Props {
  settings: AppSettings;
  token: string;
  selectedConnectionId: string | null;
  onSelectedConnectionChange: (id: string | null) => void;
  saveConnection: (conn: SavedConnection, token: string) => Promise<void>;
  removeConnection: (id: string) => Promise<void>;
  update: <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => void;
}

type ConnectionTab = "connection" | "integrations";

export default function ConnectionSection({
  settings,
  token,
  selectedConnectionId,
  onSelectedConnectionChange,
  saveConnection,
  removeConnection,
  update,
}: Props) {
  const { t } = useTranslation();
  const [editingId, setEditingId] = useState<string | null>(selectedConnectionId);
  const [activeTab, setActiveTab] = useState<ConnectionTab>("connection");
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [editToken, setEditToken] = useState("");
  const [showToken, setShowToken] = useState(false);
  const [status, setStatus] = useState<
    "idle" | "testing" | "connected" | "error"
  >("idle");
  const [statusMessage, setStatusMessage] = useState("");

  const loadFormForConnection = useCallback(
    async (id: string | null) => {
      setEditingId(id);
      setStatus("idle");
      setStatusMessage("");
      setShowToken(false);
      // Integrations bind to a saved connection id — a new one has none yet.
      if (!id) setActiveTab("connection");

      if (id) {
        const conn = settings.connections.find((c) => c.id === id);
        if (conn) {
          setName(conn.name);
          setUrl(conn.url);
          try {
            const t = await getConnectionToken(conn.id, conn.url);
            setEditToken(t ?? "");
          } catch {
            setEditToken("");
          }
        }
      } else {
        setName("");
        setUrl("");
        setEditToken("");
      }
    },
    [settings.connections],
  );

  useEffect(() => {
    if (selectedConnectionId) {
      loadFormForConnection(selectedConnectionId);
      return;
    }

    loadFormForConnection(null);
    if (settings.connections.length === 0 && settings.kimaiUrl) {
      setUrl(settings.kimaiUrl);
    }
  }, [
    selectedConnectionId,
    settings.connections.length,
    settings.kimaiUrl,
    loadFormForConnection,
  ]);

  useEffect(() => {
    if (
      editingId === settings.activeConnectionId &&
      token &&
      !editToken
    ) {
      setEditToken(token);
    }
  }, [token, editingId, settings.activeConnectionId, editToken]);

  const insecure = url.length > 0 && isInsecureUrl(url);

  const handleTestAndSave = useCallback(async () => {
    setStatus("testing");
    setStatusMessage("");

    let result: ConnectionResult;
    try {
      result = await testConnection(url, editToken);
    } catch {
      setStatus("error");
      setStatusMessage(t("connection.unexpectedError"));
      return;
    }

    if (result.success && result.user) {
      let connName = name;
      if (!connName) {
        try {
          connName = new URL(url).hostname;
        } catch {
          connName = url;
        }
      }
      const id = editingId || crypto.randomUUID();

      await saveConnection({ id, name: connName, url }, editToken);
      setEditingId(id);
      onSelectedConnectionChange(id);
      if (!name) setName(connName);

      setStatus("connected");
      const who = result.user.alias || result.user.username;
      const ver = result.version ? ` · Kimai ${result.version.version}` : "";
      setStatusMessage(`${t("connection.connectedAs", { user: who })}${ver}`);
    } else {
      setStatus("error");
      setStatusMessage(result.error ?? t("connection.connectionFailed"));
    }
  }, [
    url,
    editToken,
    name,
    editingId,
    saveConnection,
    onSelectedConnectionChange,
    t,
  ]);

  const handleDelete = useCallback(
    async () => {
      if (!editingId) return;
      const id = editingId;
      await removeConnection(id);
      const remaining = settings.connections.filter((c) => c.id !== id);
      const nextId = remaining[0]?.id ?? null;
      onSelectedConnectionChange(nextId);
      loadFormForConnection(nextId);
    },
    [
      editingId,
      settings.connections,
      removeConnection,
      onSelectedConnectionChange,
      loadFormForConnection,
    ],
  );

  return (
    <div>
      <SectionTitle>{t("connection.title")}</SectionTitle>
      <SectionDescription>
        {t("connection.description")}
      </SectionDescription>

      <div className="mb-4 mt-3 flex gap-4 border-b border-gray-200 dark:border-gray-800">
        <TabButton
          active={activeTab === "connection"}
          onClick={() => setActiveTab("connection")}
        >
          {t("connection.tabConnection")}
        </TabButton>
        <TabButton
          active={activeTab === "integrations"}
          disabled={!editingId}
          title={
            !editingId ? t("connection.saveFirstForIntegrations") : undefined
          }
          onClick={() => setActiveTab("integrations")}
        >
          {t("integrations.title")}
          {!editingId && (
            <svg
              className="h-3 w-3"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M16.5 10.5V6.75a4.5 4.5 0 00-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z"
              />
            </svg>
          )}
        </TabButton>
      </div>

      {activeTab === "integrations" && editingId ? (
        <IntegrationsSection
          settings={settings}
          update={update}
          connectionId={editingId}
        />
      ) : (
        <>
      {editingId && (
        <div className="mb-4 flex items-center justify-between gap-3 rounded-md border border-gray-200 bg-gray-50 px-3 py-2 dark:border-gray-700 dark:bg-gray-800/50">
          <div className="min-w-0">
            <div className="truncate text-[12px] font-medium text-gray-700 dark:text-gray-300">
              {settings.connections.find((c) => c.id === editingId)?.name}
            </div>
            <div className="truncate text-[11px] text-gray-400 dark:text-gray-500">
              {settings.connections.find((c) => c.id === editingId)?.url}
            </div>
          </div>
          <button
            type="button"
            onClick={handleDelete}
            className="shrink-0 rounded-md px-2 py-1 text-[11px] font-medium text-red-500 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950/30"
          >
            {t("common.delete")}
          </button>
        </div>
      )}

      {insecure && (
        <div className="mb-3 flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-[12px] text-amber-700 dark:border-amber-800/40 dark:bg-amber-950/20 dark:text-amber-400">
          <svg
            className="mt-0.5 h-3.5 w-3.5 shrink-0"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z"
            />
          </svg>
          <span>
            {t("connection.httpsWarning")}
          </span>
        </div>
      )}

      <FieldGroup
        label={t("connection.connectionName")}
        description={t("connection.connectionNameDescription")}
      >
        <TextInput
          value={name}
          onChange={setName}
          placeholder={t("connection.connectionNamePlaceholder")}
        />
      </FieldGroup>

      <FieldGroup
        label={t("connection.baseUrl")}
        description={t("connection.baseUrlDescription")}
      >
        <TextInput
          type="url"
          value={url}
          onChange={setUrl}
          placeholder={t("connection.baseUrlPlaceholder")}
        />
      </FieldGroup>

      <FieldGroup
        label={t("connection.apiToken")}
        description={t("connection.apiTokenDescription")}
      >
        <div className="flex gap-2">
          <div className="flex-1">
            <TextInput
              type={showToken ? "text" : "password"}
              value={editToken}
              onChange={setEditToken}
              placeholder={t("connection.apiTokenPlaceholder")}
            />
          </div>
          <button
            type="button"
            onClick={() => setShowToken(!showToken)}
            className="shrink-0 rounded-md border border-gray-200 bg-gray-50 px-2.5 py-1.5 text-[11px] text-gray-500
              hover:bg-gray-100 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-400 dark:hover:bg-gray-700
              focus:outline-none focus-visible:ring-1 focus-visible:ring-blue-400"
          >
            {showToken ? t("common.hide") : t("common.show")}
          </button>
        </div>
      </FieldGroup>

      <Divider />

      {/* Test & Save + status */}
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={handleTestAndSave}
          disabled={status === "testing" || !url || !editToken}
          className="rounded-md bg-[var(--accent)] px-3.5 py-1.5 text-[12px] font-medium text-white
            hover:bg-[var(--accent-hover)] active:opacity-80
            disabled:opacity-50 disabled:cursor-not-allowed
            focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-1
            transition-colors"
        >
          {status === "testing" ? t("connection.testing") : t("connection.testAndSave")}
        </button>

        <StatusBadge status={status} message={statusMessage} />
      </div>
        </>
      )}
    </div>
  );
}

function TabButton({
  active,
  disabled,
  title,
  onClick,
  children,
}: {
  active: boolean;
  disabled?: boolean;
  title?: string;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={`-mb-px inline-flex items-center gap-1.5 border-b-2 px-1 pb-2 text-[13px] font-medium transition-colors
        focus:outline-none focus-visible:ring-1 focus-visible:ring-blue-400
        disabled:cursor-not-allowed disabled:opacity-50 ${
          active
            ? "border-[var(--accent)] text-[var(--accent)]"
            : "border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
        }`}
    >
      {children}
    </button>
  );
}

function StatusBadge({
  status,
  message,
}: {
  status: "idle" | "testing" | "connected" | "error";
  message: string;
}) {
  if (status === "idle" || status === "testing") return null;

  const isOk = status === "connected";
  return (
    <span
      className={`flex items-center gap-1.5 text-[12px] ${
        isOk
          ? "text-emerald-600 dark:text-emerald-400"
          : "text-red-500 dark:text-red-400"
      }`}
    >
      {isOk ? (
        <svg
          className="h-3.5 w-3.5"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2.5}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M5 13l4 4L19 7"
          />
        </svg>
      ) : (
        <svg
          className="h-3.5 w-3.5"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2.5}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M6 18L18 6M6 6l12 12"
          />
        </svg>
      )}
      {message}
    </span>
  );
}
