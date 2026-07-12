import { useQuery } from "@tanstack/react-query";
import type { KimaiClient } from "../api/kimaiClient";
import { getTags, type KimaiTag } from "../api/tagApi";

/**
 * Fetches the existing tags (with colors) for the active connection.
 * Returns an empty array while loading or when no client is available.
 */
export function useKimaiTags(client: KimaiClient | null): KimaiTag[] {
  const { data } = useQuery({
    queryKey: ["tags", client?.cacheScope],
    queryFn: () => getTags(client!),
    enabled: !!client,
    staleTime: 5 * 60 * 1000,
  });
  return data ?? [];
}
