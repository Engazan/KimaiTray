import { describe, expect, it } from "vitest";
import { expectArrayOf, expectObject, isRecord } from "./responseValidation";

const isNamedRecord = (value: unknown): value is { name: string } =>
  isRecord(value) && typeof value.name === "string";

describe("issue provider response validation", () => {
  it("accepts arrays and objects whose complete shape matches", () => {
    expect(expectArrayOf([{ name: "one" }], isNamedRecord, "Issues")).toEqual([
      { name: "one" },
    ]);
    expect(expectObject({ name: "one" }, isNamedRecord, "Issue")).toEqual({
      name: "one",
    });
  });

  it("rejects malformed containers and malformed members", () => {
    expect(() => expectArrayOf({}, isNamedRecord, "Issues")).toThrow(
      "Issues returned an invalid response",
    );
    expect(() =>
      expectArrayOf([{ name: 1 }], isNamedRecord, "Issues"),
    ).toThrow("Issues returned an invalid response");
    expect(() => expectObject(null, isNamedRecord, "Issue")).toThrow(
      "Issue returned an invalid response",
    );
  });
});
