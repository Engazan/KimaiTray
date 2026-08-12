import { describe, expect, it } from "vitest";
import { LatestRequest } from "./latestRequest";

describe("LatestRequest", () => {
  it("rejects an older async result after a newer request starts", () => {
    const requests = new LatestRequest();
    const connectionA = requests.begin();
    const connectionB = requests.begin();

    expect(requests.isCurrent(connectionA)).toBe(false);
    expect(requests.isCurrent(connectionB)).toBe(true);
  });

  it("invalidates the currently active request without starting another", () => {
    const requests = new LatestRequest();
    const generation = requests.begin();

    requests.invalidate();

    expect(requests.isCurrent(generation)).toBe(false);
  });
});
