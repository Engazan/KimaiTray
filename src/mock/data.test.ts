import { describe, expect, it } from "vitest";
import { mockActiveTimer, mockRecentTasks, mockTodayTotal } from "./data";

describe("mock fixtures", () => {
  it("provide representative timer, recent and total data", () => {
    expect(mockActiveTimer.id).toBeGreaterThan(0);
    expect(mockRecentTasks.length).toBeGreaterThan(0);
    expect(mockTodayTotal).toMatch(/h/);
  });
});
