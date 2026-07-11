// @vitest-environment jsdom

import { beforeEach, describe, expect, it } from "vitest";
import type { ExternalIssue } from "./types";
import {
  readLinkedIssueForTimer,
  readLinkedIssueMap,
  storeLinkedIssueForTask,
  storeLinkedIssueForTimer,
  taskKeyOf,
} from "./linkedIssueStore";

const issue: ExternalIssue = {
  id: 42,
  title: "Isolated issue",
  state: "opened",
  webUrl: "https://git.example.test/group/project/-/issues/42",
  labels: ["security"],
  author: "developer",
  timeEstimate: 3600,
};

describe("linked issue persistence", () => {
  beforeEach(() => localStorage.clear());

  it("isolates timer associations by connection and timer id", () => {
    storeLinkedIssueForTimer("connection-a", 100, issue);

    expect(readLinkedIssueForTimer("connection-a", 100)).toEqual(issue);
    expect(readLinkedIssueForTimer("connection-a", 101)).toBeNull();
    expect(readLinkedIssueForTimer("connection-b", 100)).toBeNull();
  });

  it("isolates per-task associations by connection", () => {
    const taskKey = taskKeyOf(7, 9);
    storeLinkedIssueForTask("connection-a", taskKey, issue);

    expect(readLinkedIssueMap("connection-a")[taskKey]).toEqual(issue);
    expect(readLinkedIssueMap("connection-b")).toEqual({});
  });

  it("ignores malformed persisted values", () => {
    localStorage.setItem(
      "kimai:linkedIssue:connection-a",
      JSON.stringify({ timerId: 100, issue: { id: 42 } }),
    );
    localStorage.setItem(
      "kimai:linkedIssueByKey:connection-a",
      JSON.stringify({ "7-9": { id: 42 }, valid: issue }),
    );

    expect(readLinkedIssueForTimer("connection-a", 100)).toBeNull();
    expect(readLinkedIssueMap("connection-a")).toEqual({ valid: issue });
  });

  it("does not create shared entries without a connection id", () => {
    storeLinkedIssueForTimer("", 100, issue);
    storeLinkedIssueForTask("", "7-9", issue);

    expect(localStorage).toHaveLength(0);
    expect(readLinkedIssueForTimer("", 100)).toBeNull();
    expect(readLinkedIssueMap("")).toEqual({});
  });
});
