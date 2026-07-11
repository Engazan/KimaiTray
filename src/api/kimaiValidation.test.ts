import { describe, expect, it } from "vitest";
import {
  isKimaiActivity,
  isKimaiCustomer,
  isKimaiProject,
  isKimaiTimesheet,
  isKimaiUser,
  isKimaiVersion,
} from "./kimaiValidation";

describe("Kimai response entity validation", () => {
  it("accepts the fields consumed by the UI", () => {
    expect(
      isKimaiTimesheet({
        id: 1,
        begin: "2026-07-11T09:00:00+0200",
        end: null,
        duration: null,
        billable: true,
        tags: ["support"],
        project: { id: 2 },
        activity: 3,
      }),
    ).toBe(true);
    expect(isKimaiProject({ id: 2, name: "Project", customer: 4 })).toBe(true);
    expect(isKimaiActivity({ id: 3, name: "Activity", project: null })).toBe(true);
    expect(isKimaiCustomer({ id: 4, name: "Customer" })).toBe(true);
    expect(isKimaiUser({ id: 5, username: "user", alias: null })).toBe(true);
    expect(isKimaiVersion({ version: "2.30.0" })).toBe(true);
  });

  it("rejects malformed identities and fields before UI mapping", () => {
    expect(isKimaiTimesheet({ id: "1", begin: "invalid" })).toBe(false);
    expect(isKimaiProject({ id: 2, name: "Project", customer: "4" })).toBe(false);
    expect(isKimaiActivity({ id: 3, name: null, project: null })).toBe(false);
    expect(isKimaiCustomer(null)).toBe(false);
    expect(isKimaiUser({ id: 5, username: "user", alias: 123 })).toBe(false);
    expect(isKimaiVersion({ version: 230 })).toBe(false);
  });
});
