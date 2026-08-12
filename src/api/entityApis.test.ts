import { beforeEach, describe, expect, it, vi } from "vitest";
import type { KimaiClient } from "./kimaiClient";
import {
  getActivities,
  getActivitiesForProject,
  getActivity,
} from "./activityApi";
import {
  getCustomer,
  getCustomers,
  getProject,
  getProjects,
} from "./projectApi";
import {
  deleteTimesheet,
  getActiveTimesheets,
  getRecentTimesheets,
  getTimesheet,
  getTimesheets,
  restartTimesheet,
  startTimesheet,
  stopTimesheet,
  updateTimesheet,
  updateTimesheetMeta,
} from "./timesheetApi";

const activity = { id: 2, name: "Development", project: 1 };
const project = { id: 1, name: "KimaiTray", customer: 3 };
const customer = { id: 3, name: "ACME" };
const timesheet = {
  id: 7,
  begin: "2026-08-12T08:00:00+0200",
  end: null,
  duration: null,
  billable: true,
  tags: ["testing"],
  project: 1,
  activity: 2,
};

function createClient() {
  return {
    get: vi.fn(),
    post: vi.fn(),
    patch: vi.fn(),
    del: vi.fn(),
  } as unknown as KimaiClient;
}

describe("Kimai entity API adapters", () => {
  let client: KimaiClient;

  beforeEach(() => {
    client = createClient();
  });

  it("forwards activity filters and validates list responses", async () => {
    vi.mocked(client.get).mockResolvedValue([activity]);

    await expect(getActivities(client, { visible: "1" })).resolves.toEqual([
      activity,
    ]);
    expect(client.get).toHaveBeenCalledWith("/api/activities", { visible: "1" });

    await expect(getActivitiesForProject(client, 41)).resolves.toEqual([
      activity,
    ]);
    expect(client.get).toHaveBeenLastCalledWith("/api/activities", {
      project: 41,
    });
  });

  it("loads one activity and rejects malformed responses", async () => {
    vi.mocked(client.get).mockResolvedValueOnce(activity).mockResolvedValueOnce({
      id: "bad",
    });

    await expect(getActivity(client, 2)).resolves.toEqual(activity);
    expect(client.get).toHaveBeenCalledWith("/api/activities/2");
    await expect(getActivity(client, 2)).rejects.toThrow(
      "Failed to parse server response",
    );
  });

  it("loads projects and customers with the supplied filters", async () => {
    vi.mocked(client.get)
      .mockResolvedValueOnce([project])
      .mockResolvedValueOnce(project)
      .mockResolvedValueOnce([customer])
      .mockResolvedValueOnce(customer);

    await expect(getProjects(client, { customer: 3 })).resolves.toEqual([
      project,
    ]);
    await expect(getProject(client, 1)).resolves.toEqual(project);
    await expect(getCustomers(client, { visible: "1" })).resolves.toEqual([
      customer,
    ]);
    await expect(getCustomer(client, 3)).resolves.toEqual(customer);

    expect(client.get).toHaveBeenNthCalledWith(1, "/api/projects", {
      customer: 3,
    });
    expect(client.get).toHaveBeenNthCalledWith(2, "/api/projects/1");
    expect(client.get).toHaveBeenNthCalledWith(3, "/api/customers", {
      visible: "1",
    });
    expect(client.get).toHaveBeenNthCalledWith(4, "/api/customers/3");
  });

  it.each([
    ["active", () => getActiveTimesheets(client), "/api/timesheets/active", undefined],
    ["recent", () => getRecentTimesheets(client, 25), "/api/timesheets/recent", { size: 25 }],
    ["filtered", () => getTimesheets(client, { active: "1" }), "/api/timesheets", { active: "1" }],
  ])("loads %s timesheets through the expected endpoint", async (_name, call, path, params) => {
    vi.mocked(client.get).mockResolvedValue([timesheet]);

    await expect(call()).resolves.toEqual([timesheet]);
    if (params === undefined) {
      expect(client.get).toHaveBeenCalledWith(path);
    } else {
      expect(client.get).toHaveBeenCalledWith(path, params);
    }
  });

  it("uses ten entries as the recent-timesheet default", async () => {
    vi.mocked(client.get).mockResolvedValue([timesheet]);

    await getRecentTimesheets(client);

    expect(client.get).toHaveBeenCalledWith("/api/timesheets/recent", {
      size: 10,
    });
  });

  it("loads, creates, stops, restarts and updates a timesheet", async () => {
    vi.mocked(client.get).mockResolvedValue(timesheet);
    vi.mocked(client.post).mockResolvedValue(timesheet);
    vi.mocked(client.patch).mockResolvedValue(timesheet);
    const create = { project: 1, activity: 2, description: "Tests" };
    const update = { description: "More tests" };
    const meta = { name: "issue_link", value: "KT-7" };

    await expect(getTimesheet(client, 7)).resolves.toEqual(timesheet);
    await expect(startTimesheet(client, create)).resolves.toEqual(timesheet);
    await expect(stopTimesheet(client, 7)).resolves.toEqual(timesheet);
    await expect(restartTimesheet(client, 7)).resolves.toEqual(timesheet);
    await expect(updateTimesheet(client, 7, update)).resolves.toEqual(timesheet);
    await expect(updateTimesheetMeta(client, 7, meta)).resolves.toEqual(timesheet);

    expect(client.get).toHaveBeenCalledWith("/api/timesheets/7");
    expect(client.post).toHaveBeenCalledWith("/api/timesheets", create);
    expect(client.patch).toHaveBeenNthCalledWith(1, "/api/timesheets/7/stop");
    expect(client.patch).toHaveBeenNthCalledWith(2, "/api/timesheets/7/restart");
    expect(client.patch).toHaveBeenNthCalledWith(3, "/api/timesheets/7", update);
    expect(client.patch).toHaveBeenNthCalledWith(4, "/api/timesheets/7/meta", meta);
  });

  it("deletes a timesheet without manufacturing a response", async () => {
    vi.mocked(client.del).mockResolvedValue(undefined);

    await expect(deleteTimesheet(client, 7)).resolves.toBeUndefined();
    expect(client.del).toHaveBeenCalledWith("/api/timesheets/7");
  });

  it("rejects malformed timesheet entities at every boundary", async () => {
    vi.mocked(client.get).mockResolvedValue([{ id: "bad" }]);
    await expect(getActiveTimesheets(client)).rejects.toThrow(
      "Failed to parse server response",
    );

    vi.mocked(client.post).mockResolvedValue({ id: "bad" });
    await expect(
      startTimesheet(client, { project: 1, activity: 2 }),
    ).rejects.toThrow("Failed to parse server response");
  });
});
