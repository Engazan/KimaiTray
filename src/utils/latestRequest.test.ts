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
});
