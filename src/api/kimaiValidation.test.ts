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
  const timesheet = {
    id: 1,
    begin: "2026-07-11T09:00:00+0200",
    end: null,
    duration: null,
    billable: true,
    tags: ["support"],
    project: { id: 2 },
    activity: 3,
  };

  it("accepts the fields consumed by the UI", () => {
    expect(isKimaiTimesheet(timesheet)).toBe(true);
    expect(
      isKimaiTimesheet({
        ...timesheet,
        end: "2026-07-11T10:00:00+0200",
        duration: 3600,
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

  it("rejects semantically invalid timesheet values", () => {
    expect(isKimaiTimesheet({ ...timesheet, id: 1.5 })).toBe(false);
    expect(isKimaiTimesheet({ ...timesheet, project: 0 })).toBe(false);
    expect(isKimaiTimesheet({ ...timesheet, activity: { id: -2 } })).toBe(false);
    expect(isKimaiTimesheet({ ...timesheet, begin: "not-a-date" })).toBe(false);
    expect(isKimaiTimesheet({ ...timesheet, duration: -1 })).toBe(false);
    expect(
      isKimaiTimesheet({
        ...timesheet,
        end: "2026-07-11T08:59:59+0200",
      }),
    ).toBe(false);
  });

  it("rejects non-positive entity identities", () => {
    expect(isKimaiProject({ id: 0, name: "Project", customer: 4 })).toBe(false);
    expect(isKimaiProject({ id: 2, name: "Project", customer: -1 })).toBe(false);
    expect(isKimaiActivity({ id: 1.5, name: "Activity", project: null })).toBe(
      false,
    );
    expect(isKimaiCustomer({ id: -1, name: "Customer" })).toBe(false);
    expect(isKimaiUser({ id: 0, username: "user", alias: null })).toBe(false);
  });
});
