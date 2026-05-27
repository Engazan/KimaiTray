import { useCallback, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { KimaiClient } from "../api/kimaiClient";
import { KimaiApiError } from "../api/kimaiClient";
import { getActiveTimesheets, stopTimesheet } from "../api/timesheetApi";
import type { ActiveTimer } from "../types";
import { extractId } from "../api/kimaiTypes";
import { normalizeKimaiTags } from "../api/tagUtils";
import { useEntityLookup } from "./useEntityLookup";
import { invalidateTimesheets } from "./invalidateTimesheets";

export type ConnectionStatus =
  | "connected"
  | "loading"
  | "error"
  | "offline"
  | "unconfigured";

interface UseActiveTimerResult {
  timer: ActiveTimer | null;
  multipleActive: boolean;
  status: ConnectionStatus;
  errorMessage: string;
  isStopping: boolean;
  stopTimer: () => void;
}

export function useActiveTimer(
  client: KimaiClient | null,
  isConfigured: boolean,
  refreshIntervalSec: number,
): UseActiveTimerResult {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const enabled = !!client;

  const activeQ = useQuery({
    queryKey: ["active-timesheets", client?.baseUrl],
    queryFn: () => getActiveTimesheets(client!),
    enabled,
    refetchInterval: refreshIntervalSec * 1000,
  });

  const entries = activeQ.data ?? [];

  const neededIds = useMemo(() => {
    const projectIds = [...new Set(entries.map((e) => extractId(e.project)))];
    const activityIds = [...new Set(entries.map((e) => extractId(e.activity)))];
    return { projectIds, activityIds };
  }, [entries]);

  const { projects, activities, customers } = useEntityLookup(
    client,
    enabled,
    neededIds.projectIds,
    neededIds.activityIds,
  );

  const timer = useMemo<ActiveTimer | null>(() => {
    if (entries.length === 0) return null;
    const entry = entries.reduce((a, b) => (a.begin > b.begin ? a : b));
    const projectId = extractId(entry.project);
    const activityId = extractId(entry.activity);
    const proj = projects.find((p) => p.id === projectId);
    const act = activities.find((a) => a.id === activityId);
    const cust = proj
      ? customers.find((c) => c.id === proj.customer)
      : undefined;
    return {
      id: entry.id,
      projectId,
      activityId,
      project: proj?.name ?? `Project #${projectId}`,
      projectColor: proj?.color ?? "",
      activityColor: act?.color ?? "",
      customerColor: cust?.color ?? "",
      activity: act?.name ?? `Activity #${activityId}`,
      description: entry.description ?? "",
      tags: normalizeKimaiTags(entry.tags),
      beginSeconds: Math.floor(new Date(entry.begin).getTime() / 1000),
      beginIso: entry.begin,
    };
  }, [entries, projects, activities, customers]);

  const stopMut = useMutation({
    mutationFn: (id: number) => stopTimesheet(client!, id),
    onSuccess: () => {
      invalidateTimesheets(qc);
    },
  });

  const stopTimer = useCallback(() => {
    if (timer) stopMut.mutate(timer.id);
  }, [timer, stopMut]);

  // Derive connection status
  let status: ConnectionStatus = "connected";
  let errorMessage = "";

  if (!isConfigured) {
    status = "unconfigured";
  } else if (activeQ.isLoading) {
    status = "loading";
  } else if (activeQ.error) {
    const err = activeQ.error;
    if (err instanceof KimaiApiError) {
      status = err.code === "network_error" ? "offline" : "error";
      errorMessage = err.message;
    } else {
      status = "error";
      errorMessage = String(err);
    }
  }

  if (stopMut.error) {
    errorMessage =
      stopMut.error instanceof KimaiApiError
        ? stopMut.error.message
        : t("errors.failedToStopTimer");
  }

  return {
    timer,
    multipleActive: entries.length > 1,
    status,
    errorMessage,
    isStopping: stopMut.isPending,
    stopTimer,
  };
}
