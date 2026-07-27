import { describe, expect, it } from "vitest";
import { getIssueLinkMeta } from "./timesheetMeta";

describe("timesheet issue metadata", () => {
  it("reads issue_link from Kimai meta fields", () => {
    expect(
      getIssueLinkMeta({
        metaFields: [
          { name: "other", value: "ignored" },
          { name: "issue_link", value: "CREATIVE-123" },
        ],
      }),
    ).toBe("CREATIVE-123");
  });

  it("ignores missing, empty, and non-string values", () => {
    expect(getIssueLinkMeta({})).toBeUndefined();
    expect(
      getIssueLinkMeta({
        metaFields: [{ name: "issue_link", value: "  " }],
      }),
    ).toBeUndefined();
    expect(
      getIssueLinkMeta({
        metaFields: [{ name: "issue_link", value: 123 }],
      }),
    ).toBeUndefined();
  });
});
