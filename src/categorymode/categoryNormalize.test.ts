import { describe, expect, it } from "vitest";
import { normalizeCategories } from "./categoryNormalize";

describe("category configuration normalization", () => {
  it("returns an empty list for non-array input", () => {
    expect(normalizeCategories(null)).toEqual([]);
    expect(normalizeCategories({ categories: [] })).toEqual([]);
  });

  it("drops invalid categories and children", () => {
    expect(
      normalizeCategories([null, "category", { id: "valid", children: [null, 1] }]),
    ).toEqual([
      {
        id: "valid",
        label: "",
        icon: undefined,
        color: undefined,
        children: [],
      },
    ]);
  });

  it("keeps safe values and filters invalid tag entries", () => {
    expect(
      normalizeCategories([
        {
          id: "support",
          label: "Support",
          icon: "headset",
          color: "emerald",
          children: [
            {
              id: "incident",
              label: "Incident",
              activityName: "Support",
              tags: ["urgent", 42, null],
              requiresProject: true,
            },
          ],
        },
      ]),
    ).toEqual([
      {
        id: "support",
        label: "Support",
        icon: "headset",
        color: "emerald",
        children: [
          {
            id: "incident",
            label: "Incident",
            activityName: "Support",
            tags: ["urgent"],
            requiresProject: true,
          },
        ],
      },
    ]);
  });

  it("replaces unsafe visual identities and scalar values with defaults", () => {
    const [category] = normalizeCategories([
      {
        id: 123,
        label: 456,
        icon: "script-injection",
        color: "transparent",
        children: [
          {
            id: null,
            label: false,
            activityName: 7,
            tags: "not-an-array",
            requiresProject: "yes",
          },
        ],
      },
    ]);

    expect(category.id).toEqual(expect.any(String));
    expect(category.id).not.toBe("");
    expect(category).toMatchObject({
      label: "",
      icon: undefined,
      color: undefined,
    });
    expect(category.children[0]).toMatchObject({
      id: expect.any(String),
      label: "",
      activityName: "",
      tags: undefined,
      requiresProject: false,
    });
  });

  it("generates distinct ids for missing identities", () => {
    const normalized = normalizeCategories([
      { children: [{}, {}] },
      { children: [] },
    ]);
    const ids = [
      normalized[0].id,
      normalized[0].children[0].id,
      normalized[0].children[1].id,
      normalized[1].id,
    ];

    expect(new Set(ids).size).toBe(ids.length);
  });
});
