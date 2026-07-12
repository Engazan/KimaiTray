import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type { KimaiClient } from "../api/kimaiClient";
import { getTimesheets } from "../api/timesheetApi";
import type { TodayEntry } from "../types";
import { extractId } from "../api/kimaiTypes";
import { normalizeKimaiTags } from "../api/tagUtils";
import { getLocalDayRange, parseKimaiDate } from "../utils/time";
import { useEntityLookup } from "./useEntityLookup";

const DEFAULT_VISIBLE = 5;

export function useTodayTimesheets(
  client: KimaiClient | null,
  isConfigured: boolean,
  refreshIntervalSec: number,
) {
  const enabled = !!client && isConfigured;
  const [sortAsc, setSortAsc] = useState(false);
  const [expanded, setExpanded] = useState(false);

  const timesheetsQ = useQuery({
    queryKey: ["today-timesheets", client?.cacheScope],
    queryFn: () => {
      const { begin, end } = getLocalDayRange();
      return getTimesheets(client!, {
        begin,
        end,
        orderBy: "begin",
        order: "DESC",
        size: 50,
      });
    },
    enabled,
    refetchInterval: refreshIntervalSec * 1000,
    staleTime: 15_000,
  });

  const neededIds = useMemo(() => {
    const raw = timesheetsQ.data ?? [];
    const projectIds = [...new Set(raw.map((e) => extractId(e.project)))];
    const activityIds = [...new Set(raw.map((e) => extractId(e.activity)))];
    return { projectIds, activityIds };
  }, [timesheetsQ.data]);

  const { projects, activities, customers } = useEntityLookup(
    client,
    enabled,
    neededIds.projectIds,
    neededIds.activityIds,
  );

  const { entries, totalDuration } = useMemo(() => {
    const raw = timesheetsQ.data ?? [];

    const mapped: TodayEntry[] = raw.map((entry) => {
      const projectId = extractId(entry.project);
      const activityId = extractId(entry.activity);
      const proj = projects.find((p) => p.id === projectId);
      const act = activities.find((a) => a.id === activityId);
      const cust = proj
        ? customers.find((c) => c.id === proj.customer)
        : undefined;

      const isRunning = entry.end === null;
      let duration = entry.duration;
      if (isRunning) {
        duration = Math.floor(
          (Date.now() - parseKimaiDate(entry.begin).getTime()) / 1000,
        );
      }

      return {
        id: entry.id,
        projectId,
        activityId,
        project: proj?.name ?? `Project #${projectId}`,
        projectColor: proj?.color ?? "",
        activityColor: act?.color ?? "",
        customerColor: cust?.color ?? "",
        customer: cust?.name ?? "",
        activity: act?.name ?? `Activity #${activityId}`,
        description: entry.description ?? "",
        tags: normalizeKimaiTags(entry.tags),
        billable: entry.billable,
        beginIso: entry.begin,
        endIso: entry.end,
        duration,
        isRunning,
      };
    });

    const sorted = [...mapped].sort((a, b) => {
      const diff =
        parseKimaiDate(a.beginIso).getTime() - parseKimaiDate(b.beginIso).getTime();
      return sortAsc ? diff : -diff;
    });

    let total = 0;
    for (const e of mapped) {
      total += e.duration ?? 0;
    }

    return { entries: sorted, totalDuration: total };
  }, [timesheetsQ.data, projects, activities, customers, sortAsc]);

  const visibleEntries = expanded
    ? entries
    : entries.slice(0, DEFAULT_VISIBLE);
  const hasMore = entries.length > DEFAULT_VISIBLE;

  return {
    entries: visibleEntries,
    totalCount: entries.length,
    totalDuration,
    hasMore,
    expanded,
    setExpanded,
    sortAsc,
    setSortAsc,
    isLoading: timesheetsQ.isLoading,
    isError: timesheetsQ.isError,
    refetch: timesheetsQ.refetch,
  };
}
