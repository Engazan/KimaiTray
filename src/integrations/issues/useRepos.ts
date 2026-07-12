import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import type { ExternalRepo, IssueIntegrationSettings } from "./types";
import { createIssueProvider } from "./issueProvider";
import { resolveIssueCacheScope } from "./issueCacheScope";

export function useRepos(
  config: IssueIntegrationSettings | null,
  token: string | null,
  connectionId: string,
) {
  const enabled = !!config?.enabled && !!token && !!config.baseUrl;

  const provider = useMemo(() => {
    if (!enabled || !config || !token) return null;
    return createIssueProvider(config, token);
  }, [enabled, config, token]);

  const cacheScope = resolveIssueCacheScope(connectionId, token);

  const query = useQuery<ExternalRepo[]>({
    queryKey: [
      "issue-repos",
      cacheScope,
      config?.provider,
      config?.baseUrl,
      config?.apiBaseUrl,
    ],
    queryFn: () => (provider!.fetchRepos ? provider!.fetchRepos() : Promise.resolve([])),
    enabled: enabled && !!provider,
    staleTime: 5 * 60_000,
    retry: 1,
  });

  return {
    repos: query.data ?? [],
    isLoading: query.isLoading && enabled,
    isError: query.isError,
  };
}
