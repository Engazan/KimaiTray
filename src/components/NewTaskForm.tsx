import { useState, useMemo, useCallback, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { KimaiClient } from "../api/kimaiClient";
import { getCustomers, getProjects } from "../api/projectApi";
import { getActivities } from "../api/activityApi";
import { useKimaiTags } from "../hooks/useKimaiTags";
import type { StartTaskPayload } from "../hooks/useStartTask";
import type { IssueIntegrationSettings } from "../integrations/issues/types";
import type { ExternalIssue } from "../integrations/issues/types";
import { useRepos } from "../integrations/issues/useRepos";
import IssuePicker from "../integrations/issues/IssuePicker";
import IssueLinkActions from "../integrations/issues/IssueLinkActions";
import TagsInput from "./TagsInput";
import DateTimePicker from "./DateTimePicker";
import SearchableSelect from "./SearchableSelect";

interface NewTaskFormProps {
  client: KimaiClient;
  hasActiveTimer: boolean;
  onSubmit: (payload: StartTaskPayload) => void;
  onCancel: () => void;
  isSubmitting: boolean;
  showNote?: boolean;
  showTags?: boolean;
  showCustomerSelect?: boolean;
  showCustomStartTime?: boolean;
  showIssuePicker?: boolean;
  issueIntegrationConfig?: IssueIntegrationSettings | null;
  issueToken?: string | null;
  onIssueLinked?: (issue: ExternalIssue | null) => void;
}

const selectCls =
  "w-full rounded-lg border border-gray-300 dark:border-white/20 bg-white dark:bg-white/[0.08] px-3 py-2 text-[13px] text-gray-700 dark:text-gray-300 placeholder:text-gray-400 dark:placeholder:text-gray-500 focus:border-[var(--accent)] focus:ring-1 focus:ring-[var(--accent)] focus:outline-none disabled:opacity-40 transition-colors";

export default function NewTaskForm({
  client,
  hasActiveTimer,
  onSubmit,
  onCancel,
  isSubmitting,
  showNote = true,
  showTags = true,
  showCustomerSelect = true,
  showCustomStartTime = true,
  showIssuePicker = false,
  issueIntegrationConfig,
  issueToken,
  onIssueLinked,
}: NewTaskFormProps) {
  const { t } = useTranslation();
  const [customerId, setCustomerId] = useState<number | null>(null);
  const [projectId, setProjectId] = useState<number | null>(null);
  const [activityId, setActivityId] = useState<number | null>(null);
  const [description, setDescription] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const [selectedIssue, setSelectedIssue] = useState<ExternalIssue | null>(null);

  // Repository for issue lookup — defaults to the one configured in settings,
  // but can be overridden per timer here.
  const [selectedRepo, setSelectedRepo] = useState(
    issueIntegrationConfig?.projectPathOrRepo ?? "",
  );
  const { repos: availableRepos } = useRepos(
    showIssuePicker ? issueIntegrationConfig ?? null : null,
    issueToken ?? null,
  );
  const repoOptions = useMemo(() => {
    const opts = availableRepos.map((r) => ({ value: r.id, label: r.label }));
    if (selectedRepo && !opts.some((o) => o.value === selectedRepo)) {
      opts.unshift({ value: selectedRepo, label: selectedRepo });
    }
    return opts;
  }, [availableRepos, selectedRepo]);
  const effectiveIssueConfig = useMemo(
    () =>
      issueIntegrationConfig
        ? { ...issueIntegrationConfig, projectPathOrRepo: selectedRepo }
        : null,
    [issueIntegrationConfig, selectedRepo],
  );

  // Follow the configured default repository when the connection/default changes.
  useEffect(() => {
    setSelectedRepo(issueIntegrationConfig?.projectPathOrRepo ?? "");
    setSelectedIssue(null);
  }, [issueIntegrationConfig?.baseUrl, issueIntegrationConfig?.projectPathOrRepo]);

  const handleSelectRepo = useCallback((v: string | null) => {
    setSelectedRepo(v ?? "");
    setSelectedIssue(null);
  }, []);

  const autoInsertUrl = issueIntegrationConfig?.autoInsertUrl ?? false;
  const handleSelectIssue = (issue: ExternalIssue | null) => {
    setSelectedIssue(issue);
    if (issue && autoInsertUrl) {
      setDescription((prev) => {
        const trimmed = prev.trim();
        return trimmed ? `${trimmed}\n${issue.webUrl}` : issue.webUrl;
      });
    }
  };
  const [useCustomTime, setUseCustomTime] = useState(false);
  const [beginTime, setBeginTime] = useState("");

  const customersQ = useQuery({
    queryKey: ["customers", client.baseUrl],
    queryFn: () => getCustomers(client),
    staleTime: 5 * 60 * 1000,
  });

  const projectsQ = useQuery({
    queryKey: ["projects", client.baseUrl],
    queryFn: () => getProjects(client),
    staleTime: 5 * 60 * 1000,
  });

  const activitiesQ = useQuery({
    queryKey: ["activities", client.baseUrl],
    queryFn: () => getActivities(client),
    staleTime: 5 * 60 * 1000,
  });

  const tagSuggestions = useKimaiTags(client);

  const qc = useQueryClient();
  const [refreshing, setRefreshing] = useState(false);

  const handleRefresh = useCallback(async () => {
    if (refreshing) return;
    setRefreshing(true);
    try {
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["customers", client.baseUrl] }),
        qc.invalidateQueries({ queryKey: ["projects", client.baseUrl] }),
        qc.invalidateQueries({ queryKey: ["activities", client.baseUrl] }),
        qc.invalidateQueries({ queryKey: ["tags", client.baseUrl] }),
      ]);
    } finally {
      setRefreshing(false);
    }
  }, [qc, client.baseUrl, refreshing]);

  const customers = customersQ.data ?? [];

  const filteredProjects = useMemo(
    () =>
      (projectsQ.data ?? []).filter(
        (p) => customerId == null || p.customer === customerId,
      ),
    [projectsQ.data, customerId],
  );

  const filteredActivities = useMemo(
    () =>
      (activitiesQ.data ?? []).filter(
        (a) =>
          projectId == null || a.project === null || a.project === projectId,
      ),
    [activitiesQ.data, projectId],
  );

  const handleCustomerChange = (id: number | null) => {
    setCustomerId(id);
    setProjectId(null);
    setActivityId(null);
  };

  const handleProjectChange = (id: number | null) => {
    setProjectId(id);
    setActivityId(null);
  };

  const selectedProject = filteredProjects.find((p) => p.id === projectId);
  const canSubmit = projectId != null && activityId != null && !isSubmitting;

  const handleSubmit = () => {
    if (!canSubmit) return;
    onIssueLinked?.(selectedIssue);
    onSubmit({
      projectId: projectId!,
      activityId: activityId!,
      description: description.trim() || undefined,
      tags: tags.length > 0 ? tags : undefined,
      label: selectedProject?.name ?? `Project #${projectId}`,
    });
  };

  return (
    <div className="flex-1 flex flex-col min-h-0">
      <div className="flex items-center gap-2 px-3 pt-2.5 pb-1.5 border-b border-gray-100 dark:border-white/[0.06]">
        <button
          onClick={onCancel}
          className="text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300 -ml-0.5 p-0.5 rounded transition-colors"
        >
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
              d="M15.75 19.5L8.25 12l7.5-7.5"
            />
          </svg>
        </button>
        <span className="text-[12px] font-semibold text-gray-700 dark:text-gray-200">
          {t("newTask.title")}
        </span>
        <button
          type="button"
          onClick={handleRefresh}
          disabled={refreshing}
          title={t("newTask.refreshLists")}
          aria-label={t("newTask.refreshLists")}
          className="ml-auto -mr-0.5 p-0.5 rounded text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300 transition-colors focus:outline-none focus-visible:ring-1 focus-visible:ring-[var(--accent)] disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <svg
            className={`h-3.5 w-3.5 ${refreshing ? "animate-spin" : ""}`}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99"
            />
          </svg>
        </button>
      </div>

      <div className="flex-1 overflow-y-auto overflow-x-hidden px-3 pt-2.5 space-y-2.5">
        {showCustomerSelect && (
          <div>
            <label className="block text-[10px] font-medium text-gray-500 dark:text-gray-400 mb-1">
              {t("newTask.customer")}
            </label>
            <SearchableSelect
              options={customers.map((c) => ({ value: c.id, label: c.name }))}
              value={customerId}
              onChange={handleCustomerChange}
              placeholder={t("newTask.allCustomers")}
              disabled={isSubmitting}
              allowEmpty
              emptyLabel={t("newTask.allCustomers")}
            />
          </div>
        )}

        <div>
          <label className="block text-[10px] font-medium text-gray-500 dark:text-gray-400 mb-1">
            {t("newTask.project")} <span className="text-[var(--accent)]">*</span>
          </label>
          <SearchableSelect
            options={filteredProjects.map((p) => ({ value: p.id, label: p.name }))}
            value={projectId}
            onChange={handleProjectChange}
            placeholder={t("newTask.selectProject")}
            disabled={isSubmitting}
          />
        </div>

        <div>
          <label className="block text-[10px] font-medium text-gray-500 dark:text-gray-400 mb-1">
            {t("newTask.activity")} <span className="text-[var(--accent)]">*</span>
          </label>
          <SearchableSelect
            options={filteredActivities.map((a) => ({ value: a.id, label: a.name }))}
            value={activityId}
            onChange={setActivityId}
            placeholder={projectId == null ? t("newTask.selectProjectFirst") : t("newTask.selectActivity")}
            disabled={isSubmitting || projectId == null}
          />
        </div>

        {showIssuePicker && issueIntegrationConfig?.enabled && issueToken && (
          <div className="space-y-2">
            {repoOptions.length > 0 && (
              <div>
                <label className="block text-[10px] font-medium text-gray-500 dark:text-gray-400 mb-1">
                  {t("integrations.repository")}
                </label>
                <SearchableSelect
                  options={repoOptions}
                  value={selectedRepo || null}
                  onChange={handleSelectRepo}
                  placeholder={t("integrations.projectPathOrRepoSelectPlaceholder")}
                  disabled={isSubmitting}
                />
              </div>
            )}
            <div>
              <label className="block text-[10px] font-medium text-gray-500 dark:text-gray-400 mb-1">
                {t("integrations.issuePicker")}
              </label>
              <IssuePicker
                config={effectiveIssueConfig ?? issueIntegrationConfig}
                token={issueToken}
                selectedIssue={selectedIssue}
                onSelectIssue={handleSelectIssue}
                disabled={isSubmitting}
              />
              {selectedIssue && (
                <IssueLinkActions
                  issue={selectedIssue}
                  description={description}
                  onDescriptionChange={setDescription}
                />
              )}
            </div>
          </div>
        )}

        {showNote && (
          <div>
            <label className="block text-[10px] font-medium text-gray-500 dark:text-gray-400 mb-1">
              {t("newTask.description")}
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              disabled={isSubmitting}
              placeholder={t("newTask.optionalNote")}
              rows={3}
              className={`${selectCls} min-h-[64px] resize-y leading-snug`}
            />
          </div>
        )}

        {showTags && (
          <div>
            <label className="block text-[10px] font-medium text-gray-500 dark:text-gray-400 mb-1">
              {t("tags.label")}
            </label>
            <TagsInput
              tags={tags}
              onChange={setTags}
              disabled={isSubmitting}
              suggestions={tagSuggestions}
              size="md"
            />
          </div>
        )}

        {showCustomStartTime && (
          <div>
            <div className="flex items-center gap-1.5 mb-1">
              <label className="text-[10px] font-medium text-gray-500 dark:text-gray-400">
                {t("newTask.startTime")}
              </label>
              <button
                type="button"
                onClick={() => setUseCustomTime(!useCustomTime)}
                className="text-[9px] font-medium text-[var(--accent)] hover:text-[var(--accent-hover)] transition-colors"
              >
                {useCustomTime ? t("newTask.useNow") : t("newTask.custom")}
              </button>
            </div>
            {useCustomTime ? (
              <DateTimePicker
                value={beginTime}
                onChange={setBeginTime}
                disabled={isSubmitting}
              />
            ) : (
              <span className="text-xs text-gray-400 dark:text-gray-500">
                {t("common.now")}
              </span>
            )}
          </div>
        )}
      </div>

      <div className="flex items-center gap-2 px-3 py-2.5 border-t border-gray-100 dark:border-white/[0.06]">
        <button
          onClick={onCancel}
          disabled={isSubmitting}
          className="flex-1 rounded-lg px-3 py-1.5 text-[11px] font-medium
            text-gray-500 dark:text-gray-400
            border border-gray-200 dark:border-white/10
            hover:bg-gray-100 dark:hover:bg-white/[0.08]
            disabled:opacity-40 disabled:cursor-not-allowed
            transition-colors focus:outline-none focus-visible:ring-1 focus-visible:ring-[var(--accent)]"
        >
          {t("common.cancel")}
        </button>
        <button
          onClick={handleSubmit}
          disabled={!canSubmit}
          className="flex-1 flex items-center justify-center gap-1.5 rounded-lg px-3 py-1.5 text-[11px] font-semibold
            bg-[var(--accent)] text-white
            hover:bg-[var(--accent-hover)] active:brightness-90
            disabled:opacity-40 disabled:cursor-not-allowed
            transition-colors focus:outline-none focus-visible:ring-1 focus-visible:ring-[var(--accent)]"
        >
          {isSubmitting ? (
            <div className="h-3 w-3 animate-spin rounded-full border-2 border-white/30 border-t-white" />
          ) : hasActiveTimer ? (
            <>
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
                  d="M7.5 21L3 16.5m0 0L7.5 12M3 16.5h13.5m0-13.5L21 7.5m0 0L16.5 12M21 7.5H7.5"
                />
              </svg>
              {t("timer.stopAndStart")}
            </>
          ) : (
            <>
              <svg className="h-3 w-3" fill="currentColor" viewBox="0 0 24 24">
                <path d="M8 5v14l11-7z" />
              </svg>
              {t("timer.startTimer")}
            </>
          )}
        </button>
      </div>
    </div>
  );
}
