import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import type { KimaiClient } from "../api/kimaiClient";
import { getRecentTimesheets } from "../api/timesheetApi";
import type { RecentTask } from "../types";
import { extractId } from "../api/kimaiTypes";
import { normalizeKimaiTags } from "../api/tagUtils";
import { differenceInLocalCalendarDays, parseKimaiDate } from "../utils/time";
import { useEntityLookup } from "./useEntityLookup";

function formatRelativeDate(iso: string): string {
  const d = parseKimaiDate(iso);
  const now = new Date();
  const diffDays = differenceInLocalCalendarDays(now, d);

  if (diffDays <= 1) {
    return new Intl.RelativeTimeFormat(undefined, { numeric: "auto" }).format(
      -diffDays,
      "day",
    );
  }
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export function useRecentTasks(
  client: KimaiClient | null,
  isConfigured: boolean,
  activeKey?: string | null,
) {
  const enabled = !!client && isConfigured;

  const recentQ = useQuery({
    queryKey: ["recent-timesheets", client?.cacheScope],
    queryFn: () => getRecentTimesheets(client!, 20),
    enabled,
    staleTime: 30_000,
  });

  const neededIds = useMemo(() => {
    const entries = recentQ.data ?? [];
    const projectIds = [...new Set(entries.map((e) => extractId(e.project)))];
    const activityIds = [...new Set(entries.map((e) => extractId(e.activity)))];
    return { projectIds, activityIds };
  }, [recentQ.data]);

  const { projects, activities, customers } = useEntityLookup(
    client,
    enabled,
    neededIds.projectIds,
    neededIds.activityIds,
  );

  const tasks = useMemo<RecentTask[]>(() => {
    const entries = [...(recentQ.data ?? [])].sort(
      (a, b) => parseKimaiDate(b.begin).getTime() - parseKimaiDate(a.begin).getTime(),
    );

    const seen = new Set<string>();
    const result: RecentTask[] = [];

    for (const entry of entries) {
      const projectId = extractId(entry.project);
      const activityId = extractId(entry.activity);
      const key = `${projectId}-${activityId}`;
      if (seen.has(key)) continue;
      if (activeKey && key === activeKey) continue;
      seen.add(key);

      const proj = projects.find((p) => p.id === projectId);
      const act = activities.find((a) => a.id === activityId);
      const cust = proj
        ? customers.find((c) => c.id === proj.customer)
        : undefined;

      result.push({
        key,
        projectId,
        activityId,
        timesheetId: entry.id,
        project: proj?.name ?? `Project #${projectId}`,
        projectColor: proj?.color ?? "",
        activityColor: act?.color ?? "",
        customerColor: cust?.color ?? "",
        customer: cust?.name ?? "",
        activity: act?.name ?? `Activity #${activityId}`,
        description: entry.description ?? "",
        tags: normalizeKimaiTags(entry.tags),
        lastUsed: formatRelativeDate(entry.begin),
      });

      if (result.length >= 6) break;
    }

    return result;
  }, [recentQ.data, projects, activities, customers, activeKey]);

  return {
    tasks,
    isLoading: recentQ.isLoading,
    isError: recentQ.isError,
  };
}
