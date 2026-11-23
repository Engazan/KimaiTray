import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import type { AppSettings, SavedConnection } from "../types";
import { testConnection, isInsecureUrl, type ConnectionResult } from "../api";
import { getConnectionToken } from "../api/connectionTokenStore";
import IntegrationsSection from "./IntegrationsSection";
import FeaturesSection from "./FeaturesSection";
import PluginsSection from "./PluginsSection";
import { TextInput, buttonClass } from "./Controls";
import {
  SettingsList,
  SettingsPage,
  SettingsRow,
  SettingsRowStacked,
  SettingsWarning,
} from "./SettingsLayout";
import { LockClosed } from "./icons";
import { LatestRequest } from "../utils/latestRequest";

interface Props {
  settings: AppSettings;
  token: string;
  selectedConnectionId: string | null;
  onSelectedConnectionChange: (id: string | null) => void;
  saveConnection: (conn: SavedConnection, token: string) => Promise<void>;
  removeConnection: (
    id: string,
  ) => Promise<{ credentialCleanupPending: boolean }>;
  update: <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => void;
  /** Make a saved connection the one the tray popup uses. */
  activateConnection?: (id: string) => Promise<void>;
}

type ConnectionTab = "connection" | "features" | "integrations" | "plugins";

export default function ConnectionSection({
  settings,
  token,
  selectedConnectionId,
  onSelectedConnectionChange,
  saveConnection,
  removeConnection,
  update,
  activateConnection,
}: Props) {
  const { t } = useTranslation();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(selectedConnectionId);
  const [activeTab, setActiveTab] = useState<ConnectionTab>("connection");
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [editToken, setEditToken] = useState("");
  const [showToken, setShowToken] = useState(false);
  const [showConnectionId, setShowConnectionId] = useState(false);
  const [connectionIdCopied, setConnectionIdCopied] = useState(false);
  const [status, setStatus] = useState<
    "idle" | "testing" | "connected" | "error"
  >("idle");
  const [statusMessage, setStatusMessage] = useState("");
  const formLoadRequestsRef = useRef(new LatestRequest());

  const loadFormForConnection = useCallback(
    async (id: string | null) => {
      const generation = formLoadRequestsRef.current.begin();
      setEditingId(id);
      setStatus("idle");
      setStatusMessage("");
      setShowToken(false);
      setShowConnectionId(false);
      setConnectionIdCopied(false);
      // Integrations bind to a saved connection id — a new one has none yet.
      if (!id) setActiveTab("connection");

      if (id) {
        const conn = settings.connections.find((c) => c.id === id);
        if (conn) {
          setName(conn.name);
          setUrl(conn.url);
          try {
            const tok = await getConnectionToken(conn.id, conn.url);
            if (!formLoadRequestsRef.current.isCurrent(generation)) return;
            setEditToken(tok ?? "");
          } catch {
            if (!formLoadRequestsRef.current.isCurrent(generation)) return;
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
  const editingConn = editingId
    ? settings.connections.find((c) => c.id === editingId)
    : undefined;

  const copyConnectionId = async () => {
    if (!editingConn || !navigator.clipboard) return;
    try {
      await navigator.clipboard.writeText(editingConn.id);
      setConnectionIdCopied(true);
    } catch {
      setConnectionIdCopied(false);
    }
  };

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

      try {
        await saveConnection({ id, name: connName, url }, editToken);
      } catch {
        setStatus("error");
        setStatusMessage(t("connection.unexpectedError"));
        return;
      }
      if (result.customFields && result.customFields.length > 0) {
        const existingFields = settings.timesheetCustomFields[id] ?? [];
        const existingNames = new Set(existingFields.map((field) => field.name));
        const discoveredFields = result.customFields.filter(
          (field) => !existingNames.has(field.name),
        );
        if (discoveredFields.length > 0) {
          update("timesheetCustomFields", {
            ...settings.timesheetCustomFields,
            [id]: [...existingFields, ...discoveredFields],
          });
        }
      }
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
    settings.timesheetCustomFields,
    update,
    onSelectedConnectionChange,
    t,
  ]);

  const handleDelete = useCallback(
    async () => {
      const id = editingId!;
      let credentialCleanupPending: boolean;
      try {
        ({ credentialCleanupPending } = await removeConnection(id));
      } catch {
        setStatus("error");
        setStatusMessage(t("connection.unexpectedError"));
        return;
      }
      const remaining = settings.connections.filter((c) => c.id !== id);
      const nextId = remaining[0]?.id ?? null;
      onSelectedConnectionChange(nextId);
      loadFormForConnection(nextId);
      if (credentialCleanupPending) {
        setStatus("error");
        setStatusMessage(t("connection.unexpectedError"));
      }
    },
    [
      editingId,
      settings.connections,
      removeConnection,
      onSelectedConnectionChange,
      loadFormForConnection,
      t,
    ],
  );

  return (
    <SettingsPage
      title={editingConn ? editingConn.name : t("connection.title")}
      titleAddon={
        editingConn && editingConn.id === settings.activeConnectionId ? (
          <span className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full bg-emerald-500/15 px-2.5 py-[3px] text-[11px] font-medium text-emerald-600 dark:text-emerald-400">
            <span className="h-1.5 w-1.5 rounded-full bg-current" />
            {t("connection.activeBadge")}
          </span>
        ) : editingConn && activateConnection ? (
          <button
            type="button"
            onClick={() => void activateConnection(editingConn.id)}
            className={buttonClass("secondary", "sm")}
          >
            {t("connection.setActive")}
          </button>
        ) : undefined
      }
      description={
        editingConn ? (
          <span className="font-mono text-[11.5px]">{editingConn.url}</span>
        ) : (
          t("connection.description")
        )
      }
    >
      <div className="-mt-1.5 flex gap-0.5 overflow-x-auto border-b border-[var(--s-line)] [scrollbar-width:none]">
        <TabButton
          active={activeTab === "connection"}
          onClick={() => setActiveTab("connection")}
        >
          {t("connection.tabConnection")}
        </TabButton>
        <TabButton
          active={activeTab === "features"}
          disabled={!editingId}
          title={!editingId ? t("connection.saveFirstForFeatures") : undefined}
          onClick={() => setActiveTab("features")}
        >
          {t("featuresSettings.title")}
          {!editingId && <LockClosed />}
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
          {!editingId && <LockClosed />}
        </TabButton>
        <TabButton
          active={activeTab === "plugins"}
          disabled={!editingId}
          title={!editingId ? t("connection.saveFirstForPlugins") : undefined}
          onClick={() => setActiveTab("plugins")}
        >
          {t("plugins.title")}
          {!editingId && <LockClosed />}
        </TabButton>
      </div>

      {activeTab === "plugins" && editingId ? (
        <PluginsSection
          settings={settings}
          update={update}
          connectionId={editingId}
        />
      ) : activeTab === "integrations" && editingId ? (
        <IntegrationsSection
          settings={settings}
          update={update}
          connectionId={editingId}
        />
      ) : activeTab === "features" ? (
        <FeaturesSection
          settings={settings}
          update={update}
          connectionId={editingId ?? ""}
        />
      ) : (
        <div className="space-y-[22px]">
          <SettingsList>
            <SettingsRowStacked
              label={t("connection.connectionName")}
              description={t("connection.connectionNameDescription")}
            >
              <TextInput
                value={name}
                onChange={setName}
                placeholder={t("connection.connectionNamePlaceholder")}
              />
            </SettingsRowStacked>


            <SettingsRowStacked
              label={t("connection.baseUrl")}
              description={t("connection.baseUrlDescription")}
            >
              <TextInput
                type="url"
                mono
                value={url}
                onChange={setUrl}
                placeholder={t("connection.baseUrlPlaceholder")}
              />
              {insecure && (
                <div className="mt-2">
                  <SettingsWarning>{t("connection.httpsWarning")}</SettingsWarning>
                </div>
              )}
            </SettingsRowStacked>

            <SettingsRowStacked
              label={t("connection.apiToken")}
              description={t("connection.apiTokenDescription")}
            >
              <div className="flex gap-2">
                <div className="flex-1">
                  <TextInput
                    mono
                    type={showToken ? "text" : "password"}
                    value={editToken}
                    onChange={setEditToken}
                    placeholder={t("connection.apiTokenPlaceholder")}
                  />
                </div>
                <button
                  type="button"
                  onClick={() => setShowToken(!showToken)}
                  className={buttonClass()}
                >
                  {showToken ? t("common.hide") : t("common.show")}
                </button>
              </div>
            </SettingsRowStacked>
          </SettingsList>

          <div className="flex flex-wrap items-center justify-end gap-3">
            <div className="mr-auto">
              <StatusBadge status={status} message={statusMessage} />
            </div>
            <button
              type="button"
              onClick={handleTestAndSave}
              disabled={status === "testing" || !url || !editToken}
              className={buttonClass("primary")}
            >
              {status === "testing" && (
                <span className="h-3 w-3 animate-spin rounded-full border-2 border-current border-r-transparent" aria-hidden="true" />
              )}
              {status === "testing" ? t("connection.testing") : t("connection.testAndSave")}
            </button>
          </div>

          {editingConn && (
            <SettingsList title={t("connection.advancedGroup")}>
              <SettingsRowStacked
                label={t("connection.internalId")}
                description={t("connection.internalIdDescription")}
              >
                {showConnectionId ? (
                  <div className="flex flex-wrap items-center gap-2">
                    <code
                      className="min-w-0 flex-1 select-all break-all rounded-lg border border-[var(--s-line)] bg-[var(--s-hover)] px-2.5 py-1.5 font-mono text-[11.5px] text-[var(--s-fg-muted)]"
                    >
                      {editingConn.id}
                    </code>
                    <button
                      type="button"
                      onClick={() => void copyConnectionId()}
                      className={buttonClass("secondary", "sm")}
                    >
                      {connectionIdCopied
                        ? t("connection.internalIdCopied")
                        : t("connection.copyInternalId")}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setShowConnectionId(false);
                        setConnectionIdCopied(false);
                      }}
                      className={buttonClass("ghost", "sm")}
                    >
                      {t("common.hide")}
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setShowConnectionId(true)}
                    className={buttonClass("secondary", "sm")}
                  >
                    {t("connection.showInternalId")}
                  </button>
                )}
              </SettingsRowStacked>
              <SettingsRow
                label={t("connection.deleteTitle")}
                description={t("connection.deleteDescription")}
              >
                <button
                  type="button"
                  onClick={() => {
                    if (confirmDelete) {
                      setConfirmDelete(false);
                      void handleDelete();
                    } else {
                      setConfirmDelete(true);
                    }
                  }}
                  onBlur={() => setConfirmDelete(false)}
                  className={
                    confirmDelete
                      ? `${buttonClass("danger")} !border-red-600 !bg-red-600 !text-white hover:!bg-red-700`
                      : buttonClass("danger")
                  }
                >
                  {confirmDelete ? t("connection.confirmDelete") : t("common.delete")}
                </button>
              </SettingsRow>
            </SettingsList>
          )}
        </div>
      )}
    </SettingsPage>
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
      className={`-mb-px inline-flex items-center gap-1.5 whitespace-nowrap border-b-2 px-3 py-[9px] text-[12.5px] transition-colors
        focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--accent)]
        disabled:cursor-not-allowed disabled:opacity-50 ${
          active
            ? "border-[var(--accent)] font-medium text-[var(--s-fg)]"
            : "border-transparent text-[var(--s-fg-muted)] hover:text-[var(--s-fg)]"
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
