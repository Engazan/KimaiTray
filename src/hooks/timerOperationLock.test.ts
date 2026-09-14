import { expect, it } from "vitest";
import { acquireTimerOperation } from "./timerOperationLock";

it("isolates connections and owners and makes release idempotent", () => {
  const owner = {};
  const first = acquireTimerOperation(owner, "a")!;
  expect(acquireTimerOperation(owner, "a")).toBeNull();
  const otherConnection = acquireTimerOperation(owner, "b")!;
  const otherOwner = acquireTimerOperation({}, "a")!;
  first();
  const next = acquireTimerOperation(owner, "a")!;
  first(); // A stale release must not unlock the next operation.
  expect(acquireTimerOperation(owner, "a")).toBeNull();
  next();
  otherConnection();
  otherOwner();
});
