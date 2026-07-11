import { useMemo } from "react";
import { useQueries, useQuery } from "@tanstack/react-query";
import type { KimaiClient } from "../api/kimaiClient";
import { getProjects, getCustomers } from "../api/projectApi";
import { getProject, getCustomer } from "../api/projectApi";
import { getActivities } from "../api/activityApi";
import { getActivity } from "../api/activityApi";
import type {
  KimaiProject,
  KimaiActivity,
  KimaiCustomer,
} from "../api/kimaiTypes";

interface EntityLookup {
  projects: KimaiProject[];
  activities: KimaiActivity[];
  customers: KimaiCustomer[];
}

export function useEntityLookup(
  client: KimaiClient | null,
  enabled: boolean,
  neededProjectIds: number[],
  neededActivityIds: number[],
): EntityLookup {
  const projectsQ = useQuery({
    queryKey: ["projects", client?.connectionId],
    queryFn: () => getProjects(client!),
    enabled,
    staleTime: 5 * 60 * 1000,
  });

  const activitiesQ = useQuery({
    queryKey: ["activities", client?.connectionId],
    queryFn: () => getActivities(client!),
    enabled,
    staleTime: 5 * 60 * 1000,
  });

  const customersQ = useQuery({
    queryKey: ["customers", client?.connectionId],
    queryFn: () => getCustomers(client!),
    enabled,
    staleTime: 5 * 60 * 1000,
  });

  const baseProjects = projectsQ.data ?? [];
  const baseActivities = activitiesQ.data ?? [];
  const baseCustomers = customersQ.data ?? [];

  const missingProjectIds = useMemo(() => {
    if (!projectsQ.isSuccess) return [];
    return neededProjectIds.filter(
      (id) => !baseProjects.some((p) => p.id === id),
    );
  }, [projectsQ.isSuccess, baseProjects, neededProjectIds]);

  const missingActivityIds = useMemo(() => {
    if (!activitiesQ.isSuccess) return [];
    return neededActivityIds.filter(
      (id) => !baseActivities.some((a) => a.id === id),
    );
  }, [activitiesQ.isSuccess, baseActivities, neededActivityIds]);

  const missingProjectQueries = useQueries({
    queries: missingProjectIds.map((id) => ({
      queryKey: ["project", client?.connectionId, id] as const,
      queryFn: () => getProject(client!, id),
      enabled: enabled && missingProjectIds.length > 0,
      staleTime: 5 * 60 * 1000,
      retry: 1,
    })),
  });

  const missingActivityQueries = useQueries({
    queries: missingActivityIds.map((id) => ({
      queryKey: ["activity", client?.connectionId, id] as const,
      queryFn: () => getActivity(client!, id),
      enabled: enabled && missingActivityIds.length > 0,
      staleTime: 5 * 60 * 1000,
      retry: 1,
    })),
  });

  const projects = useMemo(() => {
    const extra = missingProjectQueries
      .filter((q) => q.data)
      .map((q) => q.data!);
    if (extra.length === 0) return baseProjects;
    return [...baseProjects, ...extra];
  }, [baseProjects, missingProjectQueries]);

  const missingCustomerIds = useMemo(() => {
    const neededFromProjects = projects
      .filter((p) => neededProjectIds.includes(p.id))
      .map((p) => p.customer);
    return [...new Set(neededFromProjects)].filter(
      (id) => !baseCustomers.some((c) => c.id === id),
    );
  }, [projects, neededProjectIds, baseCustomers]);

  const missingCustomerQueries = useQueries({
    queries: missingCustomerIds.map((id) => ({
      queryKey: ["customer", client?.connectionId, id] as const,
      queryFn: () => getCustomer(client!, id),
      enabled: enabled && missingCustomerIds.length > 0,
      staleTime: 5 * 60 * 1000,
      retry: 1,
    })),
  });

  const activities = useMemo(() => {
    const extra = missingActivityQueries
      .filter((q) => q.data)
      .map((q) => q.data!);
    if (extra.length === 0) return baseActivities;
    return [...baseActivities, ...extra];
  }, [baseActivities, missingActivityQueries]);

  const customers = useMemo(() => {
    const extra = missingCustomerQueries
      .filter((q) => q.data)
      .map((q) => q.data!);
    if (extra.length === 0) return baseCustomers;
    return [...baseCustomers, ...extra];
  }, [baseCustomers, missingCustomerQueries]);

  return { projects, activities, customers };
}
