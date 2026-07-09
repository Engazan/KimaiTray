import { useCallback, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import type { KimaiClient } from "../api/kimaiClient";
import { getActivities } from "../api/activityApi";

export interface CategoryActivityMapping {
  /** Whether any Kimai activity with this name exists (global or project-scoped). */
  has: (activityName: string) => boolean;
  /** Resolve the activity id valid for the given project: a project-scoped match
   *  wins, else a global activity (`project === null`), else `null`. Never returns
   *  an activity scoped to a *different* project — that would be rejected by Kimai
   *  or silently mis-booked. */
  resolve: (activityName: string, projectId: number | null) => number | null;
  isLoading: boolean;
  isError: boolean;
}

interface NameEntry {
  global?: number;
  byProject: Map<number, number>;
}

/**
 * Indexes Kimai activities by name so a config leaf can be resolved to a valid
 * activity **for a chosen project** (map-by-name is robust against id changes).
 * Uses the same query key as NewTaskForm so the activity list is fetched once
 * and shared from cache.
 */
export function useCategoryActivityMapping(
  client: KimaiClient | null,
): CategoryActivityMapping {
  const q = useQuery({
    queryKey: ["activities", client?.connectionId],
    queryFn: () => getActivities(client!),
    enabled: !!client,
    staleTime: 5 * 60 * 1000,
  });

  const index = useMemo(() => {
    const m = new Map<string, NameEntry>();
    for (const a of q.data ?? []) {
      let e = m.get(a.name);
      if (!e) {
        e = { byProject: new Map() };
        m.set(a.name, e);
      }
      if (a.project === null) {
        if (e.global == null) e.global = a.id;
      } else if (!e.byProject.has(a.project)) {
        e.byProject.set(a.project, a.id);
      }
    }
    return m;
  }, [q.data]);

  const has = useCallback((name: string) => index.has(name), [index]);

  const resolve = useCallback(
    (name: string, projectId: number | null) => {
      const e = index.get(name);
      if (!e) return null;
      if (projectId != null) {
        const scoped = e.byProject.get(projectId);
        if (scoped != null) return scoped;
      }
      return e.global ?? null;
    },
    [index],
  );

  return useMemo(
    () => ({ has, resolve, isLoading: q.isLoading, isError: q.isError }),
    [has, resolve, q.isLoading, q.isError],
  );
}
