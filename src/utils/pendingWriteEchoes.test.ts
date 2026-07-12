import { describe, expect, it } from "vitest";
import { PendingWriteEchoes } from "./pendingWriteEchoes";

describe("pending store write echoes", () => {
  it("does not consume an unrelated cross-window value", () => {
    const pending = new PendingWriteEchoes<{ revision: number }>();
    pending.remember({ revision: 1 });
    expect(pending.consume({ revision: 99 })).toBe(false);
    expect(pending.consume({ revision: 1 })).toBe(true);
  });

  it("retires older writes when the store coalesces their events", () => {
    const pending = new PendingWriteEchoes<{ revision: number }>();
    pending.remember({ revision: 1 });
    pending.remember({ revision: 2 });
    expect(pending.consume({ revision: 2 })).toBe(true);
    expect(pending.consume({ revision: 1 })).toBe(false);
  });
});
