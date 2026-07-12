// @vitest-environment jsdom

import type { PropsWithChildren } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { IssueIntegrationSettings } from "./types";

const providerMocks = vi.hoisted(() => ({
  createIssueProvider: vi.fn(),
  fetchRepos: vi.fn(),
}));

vi.mock("./issueProvider", () => ({
  createIssueProvider: providerMocks.createIssueProvider,
}));

import { useRepos } from "./useRepos";

const config: IssueIntegrationSettings = {
  enabled: true,
  provider: "gitlab",
  baseUrl: "https://git.example.test",
  apiBaseUrl: "https://git.example.test/api/v4",
  projectPathOrRepo: "group/project",
  defaultState: "opened",
  assigneeOnly: false,
  syncTime: false,
  autoInsertUrl: false,
  showTimeEstimate: true,
  filterLabels: [],
  filterLabelsMode: "include",
};

describe("issue repository query isolation", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    providerMocks.fetchRepos.mockResolvedValue([
      { id: "group/project", label: "group/project" },
    ]);
    providerMocks.createIssueProvider.mockReturnValue({
      fetchRepos: providerMocks.fetchRepos,
    });
  });

  it("separates caches by connection without storing the token in query keys", async () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const wrapper = ({ children }: PropsWithChildren) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
    const { result, rerender, unmount } = renderHook(
      ({ connectionId }) =>
        useRepos(config, "secret-token-value", connectionId),
      { initialProps: { connectionId: "connection-a" }, wrapper },
    );

    await waitFor(() => expect(result.current.repos).toHaveLength(1));
    expect(providerMocks.fetchRepos).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(queryClient.getQueryCache().getAll())).not.toContain(
      "secret-token-value",
    );

    rerender({ connectionId: "connection-b" });
    await waitFor(() => expect(providerMocks.fetchRepos).toHaveBeenCalledTimes(2));

    const connectionScopes = queryClient
      .getQueryCache()
      .getAll()
      .map((query) => query.queryKey[1]);
    expect(connectionScopes).toEqual(
      expect.arrayContaining([
        expect.stringContaining("connection-a:"),
        expect.stringContaining("connection-b:"),
      ]),
    );

    unmount();
    queryClient.clear();
  });

  it("rotates cache scope after a credential change across remounts", async () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const wrapper = ({ children }: PropsWithChildren) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );

    const first = renderHook(
      () => useRepos(config, "first-secret-token", "rotating-connection"),
      { wrapper },
    );
    await waitFor(() => expect(first.result.current.repos).toHaveLength(1));
    first.unmount();

    const second = renderHook(
      () => useRepos(config, "second-secret-token", "rotating-connection"),
      { wrapper },
    );
    await waitFor(() => expect(providerMocks.fetchRepos).toHaveBeenCalledTimes(2));

    const scopes = queryClient
      .getQueryCache()
      .getAll()
      .map((query) => query.queryKey[1]);
    expect(new Set(scopes).size).toBe(2);
    expect(JSON.stringify(scopes)).not.toContain("first-secret-token");
    expect(JSON.stringify(scopes)).not.toContain("second-secret-token");

    second.unmount();
    queryClient.clear();
  });
});
