// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ExternalIssue } from "./types";
import {
  readLinkedIssueSelectionForTimer,
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
  afterEach(() => vi.restoreAllMocks());

  it("isolates timer associations by connection and timer id", () => {
    storeLinkedIssueForTimer("connection-a", 100, issue);

    expect(readLinkedIssueForTimer("connection-a", 100)).toEqual(issue);
    expect(readLinkedIssueForTimer("connection-a", 101)).toBeNull();
    expect(readLinkedIssueForTimer("connection-b", 100)).toBeNull();
  });

  it("distinguishes an explicit timer without an issue from a missing association", () => {
    storeLinkedIssueForTimer("connection-a", 100, null);

    expect(readLinkedIssueSelectionForTimer("connection-a", 100)).toBeNull();
    expect(
      readLinkedIssueSelectionForTimer("connection-a", 101),
    ).toBeUndefined();
    expect(readLinkedIssueForTimer("connection-a", 100)).toBeNull();
  });

  it("isolates per-task associations by connection", () => {
    const taskKey = taskKeyOf(7, 9);
    storeLinkedIssueForTask("connection-a", taskKey, issue);

    expect(readLinkedIssueMap("connection-a")[taskKey]).toEqual(issue);
    expect(readLinkedIssueMap("connection-b")).toEqual({});
  });

  it("uses the note to distinguish task variants while preserving empty-note keys", () => {
    expect(taskKeyOf(7, 9)).toBe("7-9");
    expect(taskKeyOf(7, 9, "First note")).not.toBe(
      taskKeyOf(7, 9, "Second note"),
    );
  });

  it("ignores malformed persisted values", () => {
    localStorage.setItem(
      "kimai:linkedIssue:connection-a",
      JSON.stringify({ timerId: 100, issue: { id: 42 } }),
    );
    localStorage.setItem(
      "kimai:linkedIssueByKey:connection-a",
      JSON.stringify({ "7-9": { id: 42 }, empty: null, valid: issue }),
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

  it("rejects invalid ids, container shapes and malformed JSON", () => {
    storeLinkedIssueForTimer("connection-a", Number.NaN, issue);
    expect(readLinkedIssueSelectionForTimer("connection-a", Number.NaN)).toBeUndefined();
    localStorage.setItem("kimai:linkedIssueByKey:connection-a", "[]");
    expect(readLinkedIssueMap("connection-a")).toEqual({});
    localStorage.setItem("kimai:linkedIssue:connection-a", "[]");
    expect(readLinkedIssueSelectionForTimer("connection-a", 1)).toBeUndefined();
    localStorage.setItem("kimai:linkedIssueByKey:connection-a", "{");
    expect(readLinkedIssueMap("connection-a")).toEqual({});
    localStorage.setItem("kimai:linkedIssue:connection-a", "{");
    expect(readLinkedIssueSelectionForTimer("connection-a", 1)).toBeUndefined();
  });

  it("tolerates storage write failures and empty task keys", () => {
    const setItem = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("quota"); });
    expect(() => storeLinkedIssueForTask("connection-a", "key", issue)).not.toThrow();
    expect(() => storeLinkedIssueForTimer("connection-a", 1, issue)).not.toThrow();
    setItem.mockRestore();
    storeLinkedIssueForTask("connection-a", "", issue);
    expect(localStorage).toHaveLength(0);
  });
});
