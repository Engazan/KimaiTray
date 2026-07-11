import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useTranslation } from "react-i18next";
import type { AppSettings } from "../../types";
import type {
  IssueIntegrationSettings,
  ExternalLabel,
  ExternalRepo,
} from "../../integrations/issues/types";
import { createIssueProvider } from "../../integrations/issues/issueProvider";
import SearchableSelect from "../../components/SearchableSelect";
import {
  getIssueToken,
  saveIssueToken,
} from "../../integrations/issues/issueTokenStore";
import {
  FieldGroup,
  SectionDescription,
  Select,
  TextInput,
  Toggle,
} from "../Controls";
import { ChevronLeft } from "../icons";

const PROVIDER_API_VERSION: Record<
  IssueIntegrationSettings["provider"],
  string
> = {
  gitlab: "v4",
  github: "REST v3 (2022-11-28)",
  gitea: "v1",
};

const PROVIDERS: IssueIntegrationSettings["provider"][] = [
  "gitlab",
  "github",
  "gitea",
];

export const emptyIssueConfig: IssueIntegrationSettings = {
  enabled: false,
  provider: "gitlab",
  baseUrl: "",
  apiBaseUrl: "",
  projectPathOrRepo: "",
  defaultState: "opened",
  assigneeOnly: false,
  syncTime: false,
  autoInsertUrl: false,
  showTimeEstimate: true,
  filterLabels: [],
  filterLabelsMode: "include",
};

interface Props {
  settings: AppSettings;
  update: <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => void;
  /** Connection whose issue integration is being configured. */
  connectionId: string;
  onBack: () => void;
}

function CheckIcon({ className = "h-3.5 w-3.5" }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={2.5}
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
    </svg>
  );
}

function XIcon({ className = "h-3.5 w-3.5" }: { className?: string }) {
  return (
    <svg
      className={className}
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
  );
}

function Panel({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <section className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm shadow-gray-200/40 dark:border-gray-800 dark:bg-[#181818] dark:shadow-black/10">
      <div className="mb-3">
        <h3 className="text-[13px] font-semibold text-gray-800 dark:text-gray-200">
          {title}
        </h3>
        {description && (
          <p className="mt-0.5 text-[11px] leading-4 text-gray-400 dark:text-gray-500">
            {description}
          </p>
        )}
      </div>
      <div className="space-y-3">{children}</div>
    </section>
  );
}

function SummaryItem({
  label,
  value,
  muted,
}: {
  label: string;
  value: string;
  muted?: boolean;
}) {
  return (
    <div className="min-w-0 rounded-md border border-gray-100 bg-gray-50 px-3 py-2 dark:border-gray-800 dark:bg-[#202020]">
      <div className="text-[10px] font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500">
        {label}
      </div>
      <div
        className={`mt-1 truncate text-[12px] font-medium ${
          muted
            ? "text-gray-400 dark:text-gray-500"
            : "text-gray-700 dark:text-gray-300"
        }`}
      >
        {value}
      </div>
    </div>
  );
}

function StatusMessage({
  status,
  message,
}: {
  status: "idle" | "testing" | "success" | "error";
  message: string;
}) {
  if (status === "idle") return null;

  if (status === "testing") {
    return (
      <div className="flex items-center gap-2 text-[12px] text-gray-500 dark:text-gray-400">
        <span className="h-2 w-2 animate-pulse rounded-full bg-[var(--accent)]" />
        <span>{message}</span>
      </div>
    );
  }

  const success = status === "success";
  return (
    <div
      className={`flex min-w-0 items-center gap-2 rounded-md border px-3 py-2 text-[12px] ${
        success
          ? "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/60 dark:bg-emerald-950/30 dark:text-emerald-300"
          : "border-red-200 bg-red-50 text-red-700 dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-300"
      }`}
    >
      {success ? <CheckIcon /> : <XIcon />}
      <span className="min-w-0">{message}</span>
    </div>
  );
}

export default function IssueIntegrationDetail({
  settings,
  update,
  connectionId,
  onBack,
}: Props) {
  const { t } = useTranslation();
  const config = settings.issueIntegrations[connectionId] ?? emptyIssueConfig;

  const [issueToken, setIssueToken] = useState("");
  const [showToken, setShowToken] = useState(false);
  const [testStatus, setTestStatus] = useState<
    "idle" | "testing" | "success" | "error"
  >("idle");
  const [testMessage, setTestMessage] = useState("");
  const [availableLabels, setAvailableLabels] = useState<ExternalLabel[]>([]);
  const [availableRepos, setAvailableRepos] = useState<ExternalRepo[]>([]);
  const [reposLoading, setReposLoading] = useState(false);
  const [manualRepo, setManualRepo] = useState(false);
  const tokenLoadGenerationRef = useRef(0);

  useEffect(() => {
    const generation = ++tokenLoadGenerationRef.current;
    if (!connectionId) {
      setIssueToken("");
      return;
    }
    getIssueToken(connectionId)
      .then((t) => {
        if (generation === tokenLoadGenerationRef.current) {
          setIssueToken(t ?? "");
        }
      })
      .catch(() => {
        if (generation === tokenLoadGenerationRef.current) {
          setIssueToken("");
        }
      });
    setTestStatus("idle");
    setTestMessage("");
    setShowToken(false);
    setAvailableLabels([]);
    setAvailableRepos([]);
    setReposLoading(false);
    setManualRepo(false);
  }, [connectionId]);

  const loadRepos = useCallback(async () => {
    if (!config.baseUrl || !issueToken) return;
    setReposLoading(true);
    try {
      const provider = createIssueProvider(config, issueToken);
      const repos = provider.fetchRepos ? await provider.fetchRepos() : [];
      setAvailableRepos(repos);
      setManualRepo(repos.length === 0);
    } catch {
      setAvailableRepos([]);
      setManualRepo(true);
    } finally {
      setReposLoading(false);
    }
  }, [config, issueToken]);

  const repoOptions = useMemo(() => {
    const opts = availableRepos.map((r) => ({ value: r.id, label: r.label }));
    if (
      config.projectPathOrRepo &&
      !opts.some((o) => o.value === config.projectPathOrRepo)
    ) {
      opts.unshift({
        value: config.projectPathOrRepo,
        label: config.projectPathOrRepo,
      });
    }
    return opts;
  }, [availableRepos, config.projectPathOrRepo]);

  const updateField = useCallback(
    <K extends keyof IssueIntegrationSettings>(
      key: K,
      value: IssueIntegrationSettings[K],
    ) => {
      if (!connectionId) return;
      const updated = { ...config, [key]: value };
      update("issueIntegrations", {
        ...settings.issueIntegrations,
        [connectionId]: updated,
      });
    },
    [config, connectionId, settings.issueIntegrations, update],
  );

  const handleProviderChange = useCallback(
    (value: string) => {
      const provider = value as IssueIntegrationSettings["provider"];
      updateField("provider", provider);
      setTestStatus("idle");
      setTestMessage("");
    },
    [updateField],
  );

  const handleTokenChange = useCallback((value: string) => {
    setIssueToken(value);
    setTestStatus("idle");
    setTestMessage("");
  }, []);

  const handleTest = useCallback(async () => {
    if (!connectionId) return;
    setTestStatus("testing");
    setTestMessage(t("integrations.testing"));
    setAvailableLabels([]);

    try {
      const provider = createIssueProvider(config, issueToken);
      const result = await provider.testConnection();
      if (result.success) {
        await saveIssueToken(connectionId, issueToken);
        setTestStatus("success");
        setTestMessage(
          t("integrations.connectionSuccess", { count: result.count ?? 0 }),
        );
        if (provider.fetchLabels) {
          provider
            .fetchLabels()
            .then(setAvailableLabels)
            .catch(() => {});
        }
        if (provider.fetchRepos) {
          provider
            .fetchRepos()
            .then((repos) => {
              setAvailableRepos(repos);
              if (repos.length > 0) setManualRepo(false);
            })
            .catch(() => {});
        }
      } else {
        setTestStatus("error");
        setTestMessage(result.error ?? t("integrations.connectionFailed"));
      }
    } catch {
      setTestStatus("error");
      setTestMessage(t("integrations.connectionFailed"));
    }
  }, [config, connectionId, issueToken, t]);

  const disabled = !config.enabled;
  const canTest =
    config.enabled &&
    config.baseUrl &&
    config.projectPathOrRepo &&
    issueToken &&
    testStatus !== "testing";
  const providerLabel = t(`integrations.${config.provider}`);
  const repoMissing = !config.projectPathOrRepo;

  return (
    <div>
      <button
        type="button"
        onClick={onBack}
        className="mb-4 flex items-center gap-1.5 rounded text-[12px] font-medium text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 transition-colors focus:outline-none focus-visible:ring-1 focus-visible:ring-blue-400"
      >
        <ChevronLeft />
        {t("integrations.title")}
      </button>

      <SectionDescription>{t("integrations.description")}</SectionDescription>

      <div className="space-y-4">
        <Panel
          title={t("integrations.git.name")}
          description={t("integrations.perConnectionHint")}
        >
          <div className="flex items-center justify-between gap-3">
            <span
              className={`text-[12px] font-medium ${
                config.enabled
                  ? "text-[var(--accent)]"
                  : "text-gray-500 dark:text-gray-400"
              }`}
            >
              {t("integrations.enabled")}
            </span>
            <Toggle
              checked={config.enabled}
              onChange={(v) => updateField("enabled", v)}
            />
          </div>

          <div className="grid gap-2 sm:grid-cols-3">
            <SummaryItem
              label={t("integrations.provider")}
              value={`${providerLabel} - ${PROVIDER_API_VERSION[config.provider]}`}
            />
            <SummaryItem
              label={t("integrations.baseUrl")}
              value={config.baseUrl || t("status.notConfigured")}
              muted={!config.baseUrl}
            />
            <SummaryItem
              label={t("integrations.repository")}
              value={config.projectPathOrRepo || t("status.notConfigured")}
              muted={repoMissing}
            />
          </div>
        </Panel>

        <Panel
          title={t("integrations.provider")}
          description={t("integrations.providerDescription")}
        >
          <div className="grid gap-2 sm:grid-cols-3">
            {PROVIDERS.map((provider) => {
              const selected = provider === config.provider;
              return (
                <button
                  key={provider}
                  type="button"
                  onClick={() => handleProviderChange(provider)}
                  disabled={disabled}
                  className={`rounded-md border px-3 py-2 text-left transition-colors
                    focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-1 dark:focus-visible:ring-offset-[#181818]
                    disabled:cursor-not-allowed disabled:opacity-50 ${
                      selected
                        ? "border-[var(--accent)] bg-[var(--accent-light)] text-[var(--accent)]"
                        : "border-gray-200 bg-gray-50 text-gray-600 hover:bg-gray-100 dark:border-gray-700 dark:bg-[#202020] dark:text-gray-300 dark:hover:bg-gray-800"
                    }`}
                >
                  <span className="block text-[12px] font-semibold">
                    {t(`integrations.${provider}`)}
                  </span>
                  <span className="mt-0.5 block text-[10px] text-gray-400 dark:text-gray-500">
                    {PROVIDER_API_VERSION[provider]}
                  </span>
                </button>
              );
            })}
          </div>
          <div className="rounded-md border border-gray-100 bg-gray-50 px-3 py-2 text-[11px] text-gray-500 dark:border-gray-800 dark:bg-[#202020] dark:text-gray-400">
            {t("integrations.apiVersionHint", {
              version: PROVIDER_API_VERSION[config.provider],
            })}
          </div>
        </Panel>

        <Panel
          title={t("integrations.baseUrl")}
          description={t("integrations.baseUrlDescription")}
        >
          <FieldGroup label={t("integrations.baseUrl")}>
            <TextInput
              type="url"
              value={config.baseUrl}
              onChange={(v) => updateField("baseUrl", v)}
              placeholder={
                config.provider === "github"
                  ? "https://github.com"
                  : config.provider === "gitea"
                    ? "https://gitea.com"
                    : t("integrations.baseUrlPlaceholder")
              }
              disabled={disabled}
            />
          </FieldGroup>

          {config.provider === "github" && (
            <FieldGroup
              label={t("integrations.apiBaseUrl")}
              description={t("integrations.apiBaseUrlDescription")}
            >
              <TextInput
                type="url"
                value={config.apiBaseUrl}
                onChange={(v) => updateField("apiBaseUrl", v)}
                placeholder={t("integrations.apiBaseUrlPlaceholder")}
                disabled={disabled}
              />
            </FieldGroup>
          )}

          <FieldGroup
            label={t("integrations.apiToken")}
            description={t("integrations.apiTokenDescription")}
          >
            <div className="flex gap-2">
              <div className="flex-1">
                <TextInput
                  type={showToken ? "text" : "password"}
                  value={issueToken}
                  onChange={handleTokenChange}
                  placeholder={t("integrations.apiTokenPlaceholder")}
                  disabled={disabled}
                />
              </div>
              <button
                type="button"
                onClick={() => setShowToken(!showToken)}
                disabled={disabled}
                className="shrink-0 rounded-md border border-gray-200 bg-gray-50 px-3 py-1.5 text-[11px] font-medium text-gray-500
                  hover:bg-gray-100 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-400 dark:hover:bg-gray-700
                  focus:outline-none focus-visible:ring-1 focus-visible:ring-blue-400
                  disabled:cursor-not-allowed disabled:opacity-50"
              >
                {showToken ? t("common.hide") : t("common.show")}
              </button>
            </div>
          </FieldGroup>
        </Panel>

        <Panel
          title={t("integrations.projectPathOrRepo")}
          description={t("integrations.projectPathOrRepoDescription")}
        >
          {!manualRepo && repoOptions.length > 0 ? (
            <SearchableSelect
              options={repoOptions}
              value={config.projectPathOrRepo || null}
              onChange={(v) => updateField("projectPathOrRepo", v ?? "")}
              placeholder={t("integrations.projectPathOrRepoSelectPlaceholder")}
              disabled={disabled}
            />
          ) : (
            <TextInput
              value={config.projectPathOrRepo}
              onChange={(v) => updateField("projectPathOrRepo", v)}
              placeholder={t("integrations.projectPathOrRepoPlaceholder")}
              disabled={disabled}
            />
          )}

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={loadRepos}
              disabled={
                disabled || !config.baseUrl || !issueToken || reposLoading
              }
              className="inline-flex items-center gap-1.5 rounded-md border border-[var(--accent)] bg-[var(--accent-light)] px-2.5 py-1.5 text-[11px] font-medium text-[var(--accent)]
                hover:bg-[var(--accent)] hover:text-white
                focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-1 dark:focus-visible:ring-offset-[#181818]
                disabled:cursor-not-allowed disabled:border-gray-200 disabled:bg-gray-50 disabled:text-gray-400 disabled:opacity-70 dark:disabled:border-gray-700 dark:disabled:bg-gray-800"
            >
              {reposLoading
                ? t("integrations.repoLoading")
                : t("integrations.repoLoad")}
            </button>
            {repoOptions.length > 0 && (
              <button
                type="button"
                onClick={() => setManualRepo((m) => !m)}
                disabled={disabled}
                className="rounded-md px-2.5 py-1.5 text-[11px] font-medium text-gray-500 hover:bg-gray-100 hover:text-gray-700
                  dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-gray-200
                  disabled:cursor-not-allowed disabled:opacity-50"
              >
                {manualRepo
                  ? t("integrations.repoPickFromList")
                  : t("integrations.repoEnterManually")}
              </button>
            )}
          </div>
        </Panel>

        <Panel
          title={t("integrations.defaultState")}
          description={t("integrations.defaultStateDescription")}
        >
          <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-start">
            <Select
              value={config.defaultState}
              onChange={(v) =>
                updateField(
                  "defaultState",
                  v as IssueIntegrationSettings["defaultState"],
                )
              }
              options={[
                { value: "opened", label: t("integrations.stateOpened") },
                { value: "all", label: t("integrations.stateAll") },
              ]}
              disabled={disabled}
            />
            <FieldGroup
              label={t("integrations.assigneeOnly")}
              description={t("integrations.assigneeOnlyDescription")}
              horizontal
            >
              <Toggle
                checked={config.assigneeOnly ?? false}
                onChange={(v) => updateField("assigneeOnly", v)}
                disabled={disabled}
              />
            </FieldGroup>
          </div>
        </Panel>

        <Panel
          title={t("integrations.filterLabels")}
          description={t(
            `integrations.filterLabelsDescription_${config.filterLabelsMode ?? "include"}`,
          )}
        >
          {availableLabels.length > 0 ? (
            <>
              <div className="flex flex-wrap items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => updateField("filterLabelsMode", "include")}
                  disabled={disabled}
                  className={`rounded-md border px-2.5 py-1.5 text-[11px] font-medium transition-colors focus:outline-none focus-visible:ring-1 focus-visible:ring-blue-400 disabled:cursor-not-allowed disabled:opacity-50 ${
                    (config.filterLabelsMode ?? "include") === "include"
                      ? "border-emerald-400 bg-emerald-50 text-emerald-700 dark:border-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-300"
                      : "border-gray-200 text-gray-500 hover:bg-gray-100 dark:border-gray-600 dark:text-gray-400 dark:hover:bg-gray-700"
                  }`}
                >
                  {t("integrations.filterModeInclude")}
                </button>
                <button
                  type="button"
                  onClick={() => updateField("filterLabelsMode", "exclude")}
                  disabled={disabled}
                  className={`rounded-md border px-2.5 py-1.5 text-[11px] font-medium transition-colors focus:outline-none focus-visible:ring-1 focus-visible:ring-blue-400 disabled:cursor-not-allowed disabled:opacity-50 ${
                    (config.filterLabelsMode ?? "include") === "exclude"
                      ? "border-red-400 bg-red-50 text-red-700 dark:border-red-600 dark:bg-red-900/30 dark:text-red-300"
                      : "border-gray-200 text-gray-500 hover:bg-gray-100 dark:border-gray-600 dark:text-gray-400 dark:hover:bg-gray-700"
                  }`}
                >
                  {t("integrations.filterModeExclude")}
                </button>
              </div>
              <div className="flex max-h-[140px] flex-wrap gap-1.5 overflow-y-auto rounded-md border border-gray-200 bg-gray-50 p-2 dark:border-gray-700 dark:bg-gray-800">
                {availableLabels.map((label) => {
                  const selected = (config.filterLabels ?? []).includes(
                    label.name,
                  );
                  const isExclude =
                    (config.filterLabelsMode ?? "include") === "exclude";
                  return (
                    <button
                      key={label.name}
                      type="button"
                      onClick={() => {
                        const current = config.filterLabels ?? [];
                        const next = selected
                          ? current.filter((l) => l !== label.name)
                          : [...current, label.name];
                        updateField("filterLabels", next);
                      }}
                      disabled={disabled}
                      className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors
                        focus:outline-none focus-visible:ring-1 focus-visible:ring-blue-400
                        disabled:cursor-not-allowed disabled:opacity-50
                        ${
                          selected
                            ? isExclude
                              ? "border-red-300 bg-red-50 text-red-700 line-through dark:border-red-700 dark:bg-red-900/30 dark:text-red-300"
                              : "border-transparent text-white shadow-sm"
                            : "border-gray-200 text-gray-600 hover:bg-gray-100 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700"
                        }`}
                      style={
                        selected && !isExclude
                          ? { backgroundColor: label.color }
                          : undefined
                      }
                    >
                      <span
                        className="inline-block h-2 w-2 shrink-0 rounded-full"
                        style={{ backgroundColor: label.color }}
                      />
                      {label.name}
                    </button>
                  );
                })}
              </div>
              {(config.filterLabels ?? []).length > 0 && (
                <button
                  type="button"
                  onClick={() => updateField("filterLabels", [])}
                  disabled={disabled}
                  className="text-left text-[11px] text-gray-400 hover:text-gray-600 disabled:cursor-not-allowed disabled:opacity-50 dark:hover:text-gray-300"
                >
                  {t("integrations.clearLabels")}
                </button>
              )}
            </>
          ) : (
            <div className="rounded-md border border-dashed border-gray-200 bg-gray-50 px-3 py-3 text-[11px] text-gray-400 dark:border-gray-700 dark:bg-gray-800/50 dark:text-gray-500">
              {t("integrations.filterLabelsHint")}
            </div>
          )}
        </Panel>

        <Panel
          title={t("integrations.autoInsertUrl")}
          description={t("integrations.autoInsertUrlDescription")}
        >
          <FieldGroup
            label={t("integrations.autoInsertUrl")}
            description={t("integrations.autoInsertUrlDescription")}
            horizontal
          >
            <Toggle
              checked={config.autoInsertUrl ?? false}
              onChange={(v) => updateField("autoInsertUrl", v)}
              disabled={disabled}
            />
          </FieldGroup>

          {(config.provider === "gitlab" || config.provider === "gitea") && (
            <FieldGroup
              label={t("integrations.syncTime")}
              description={t("integrations.syncTimeDescription")}
              horizontal
            >
              <Toggle
                checked={config.syncTime ?? false}
                onChange={(v) => updateField("syncTime", v)}
                disabled={disabled}
              />
            </FieldGroup>
          )}

          {config.provider === "gitlab" && (
            <FieldGroup
              label={t("integrations.showTimeEstimate")}
              description={t("integrations.showTimeEstimateDescription")}
              horizontal
            >
              <Toggle
                checked={config.showTimeEstimate ?? config.provider === "gitlab"}
                onChange={(v) => updateField("showTimeEstimate", v)}
                disabled={disabled}
              />
            </FieldGroup>
          )}
        </Panel>

        <section className="sticky -bottom-6 z-10 -mx-8 border-t border-gray-100 bg-white px-8 py-3 pb-6 shadow-[0_-8px_18px_rgba(0,0,0,0.04)] dark:border-gray-800 dark:bg-[#1a1a1a] dark:shadow-[0_-8px_18px_rgba(0,0,0,0.25)]">
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={handleTest}
              disabled={!canTest}
              className="rounded-md bg-[var(--accent)] px-4 py-2 text-[12px] font-semibold text-white
                transition-colors hover:bg-[var(--accent-hover)] active:opacity-80
                focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-1
                disabled:cursor-not-allowed disabled:opacity-50"
            >
              {testStatus === "testing"
                ? t("integrations.testing")
                : t("integrations.testConnection")}
            </button>

            <StatusMessage status={testStatus} message={testMessage} />
          </div>
        </section>
      </div>
    </div>
  );
}
