import { describe, expect, it } from "vitest";
import { extractId } from "./kimaiTypes";

describe("Kimai entity references", () => {
  it("extracts ids from scalar and expanded references", () => {
    expect(extractId(17)).toBe(17);
    expect(extractId({ id: 23 })).toBe(23);
  });
});
