import { useQuery } from "@tanstack/react-query";
import type { KimaiClient } from "../api/kimaiClient";
import { getActiveEntriesLimit } from "../api/timesheetApi";

/**
 * How many timers the connected instance lets the user run at once. Stays at 1
 * (single running timer) while loading or when the config cannot be read, so
 * an unknown server never ends up with more parallel timers than it allows.
 */
export function useActiveEntriesLimit(client: KimaiClient | null): number {
  const { data } = useQuery({
    queryKey: ["timesheet-config", client?.cacheScope],
    queryFn: () => getActiveEntriesLimit(client!),
    enabled: !!client,
    staleTime: 30 * 60 * 1000,
  });
  return data ?? 1;
}
