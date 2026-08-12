// @vitest-environment jsdom

import type { PropsWithChildren } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { IssueIntegrationSettings } from "./types";

const providerMocks = vi.hoisted(() => ({
  createIssueProvider: vi.fn(),
  searchIssues: vi.fn(),
}));

vi.mock("./issueProvider", () => ({
  createIssueProvider: providerMocks.createIssueProvider,
}));

import { useIssues } from "./useIssues";

const config: IssueIntegrationSettings = {
  enabled: true,
  provider: "gitlab",
  baseUrl: "https://git.test",
  apiBaseUrl: "https://git.test/api/v4",
  projectPathOrRepo: "group/project",
  defaultState: "opened",
  assigneeOnly: false,
  syncTime: false,
  autoInsertUrl: false,
  showTimeEstimate: true,
  filterLabels: [],
  filterLabelsMode: "include",
};

function setup() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity } },
  });
  const wrapper = ({ children }: PropsWithChildren) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  return { queryClient, wrapper };
}

describe("issue search query", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    providerMocks.searchIssues.mockResolvedValue([
      { id: 1, title: "Bug", url: "https://git.test/group/project/issues/1" },
    ]);
    providerMocks.createIssueProvider.mockReturnValue({
      searchIssues: providerMocks.searchIssues,
    });
  });

  it.each([
    [null, "secret", "missing config"],
    [{ ...config, enabled: false }, "secret", "disabled integration"],
    [config, null, "missing token"],
    [{ ...config, projectPathOrRepo: "" }, "secret", "missing repository"],
  ] as const)("stays idle for %s (%s)", (settings, token, _reason) => {
    const { queryClient, wrapper } = setup();
    const { result, unmount } = renderHook(
      () => useIssues(settings, token, "bug", "connection-a"),
      { wrapper },
    );

    expect(result.current).toEqual({
      issues: [],
      isLoading: false,
      isError: false,
      error: null,
    });
    expect(providerMocks.createIssueProvider).not.toHaveBeenCalled();
    expect(providerMocks.searchIssues).not.toHaveBeenCalled();
    unmount();
    queryClient.clear();
  });

  it("debounces search input before querying the provider", async () => {
    const { queryClient, wrapper } = setup();
    const { result, rerender, unmount } = renderHook(
      ({ search }) => useIssues(config, "secret-token", search, "connection-a"),
      { initialProps: { search: "" }, wrapper },
    );

    await waitFor(() =>
      expect(providerMocks.searchIssues).toHaveBeenCalledWith(""),
    );
    providerMocks.searchIssues.mockClear();

    rerender({ search: "bug" });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 200));
    });
    expect(providerMocks.searchIssues).not.toHaveBeenCalled();

    await waitFor(() => expect(providerMocks.searchIssues).toHaveBeenCalledWith("bug"));
    expect(result.current.issues).toHaveLength(1);
    expect(JSON.stringify(queryClient.getQueryCache().getAll())).not.toContain(
      "secret-token",
    );

    unmount();
    queryClient.clear();
  });

  it("exposes provider failures as a stable message", async () => {
    providerMocks.searchIssues.mockRejectedValue(new Error("Git service offline"));
    const { queryClient, wrapper } = setup();
    const { result, unmount } = renderHook(
      () => useIssues(config, "secret", "", "connection-a"),
      { wrapper },
    );

    await waitFor(() => expect(result.current.isError).toBe(true), {
      timeout: 2_500,
    });
    expect(result.current.issues).toEqual([]);
    expect(result.current.error).toBe("Git service offline");

    unmount();
    queryClient.clear();
  });
});
