import { useState, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import type { KimaiClient } from "../api/kimaiClient";
import { getCustomers, getProjects } from "../api/projectApi";
import { getActivities } from "../api/activityApi";
import type { StartTaskPayload } from "../hooks/useStartTask";
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
}: NewTaskFormProps) {
  const { t } = useTranslation();
  const [customerId, setCustomerId] = useState<number | null>(null);
  const [projectId, setProjectId] = useState<number | null>(null);
  const [activityId, setActivityId] = useState<number | null>(null);
  const [description, setDescription] = useState("");
  const [tags, setTags] = useState<string[]>([]);
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
      </div>

      <div className="flex-1 overflow-y-auto px-3 pt-2.5 space-y-2.5">
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

        {showNote && (
          <div>
            <label className="block text-[10px] font-medium text-gray-500 dark:text-gray-400 mb-1">
              {t("newTask.description")}
            </label>
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              disabled={isSubmitting}
              placeholder={t("newTask.optionalNote")}
              className={selectCls}
            />
          </div>
        )}

        {showTags && (
          <div>
            <label className="block text-[10px] font-medium text-gray-500 dark:text-gray-400 mb-1">
              {t("tags.label")}
            </label>
            <TagsInput tags={tags} onChange={setTags} disabled={isSubmitting} />
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
            hover:bg-gray-50 dark:hover:bg-white/[0.04]
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
