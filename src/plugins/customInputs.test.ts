import { describe, expect, it } from "vitest";
import {
  CREATIVE_ISSUE_LINK_INPUT_ID,
  getEnabledPluginCustomInputs,
  pickPluginMetadata,
} from "./customInputs";

describe("plugin custom input registry", () => {
  it("only exposes inputs from enabled plugins", () => {
    expect(
      getEnabledPluginCustomInputs({ creativeIssueLink: false }),
    ).toEqual([]);
    expect(
      getEnabledPluginCustomInputs({ creativeIssueLink: true }),
    ).toMatchObject([
      {
        id: CREATIVE_ISSUE_LINK_INPUT_ID,
        metadataName: "issue_link",
      },
    ]);
  });

  it("picks only metadata owned by the enabled inputs", () => {
    const inputs = getEnabledPluginCustomInputs({
      creativeIssueLink: true,
    });
    expect(
      pickPluginMetadata(
        { issue_link: " CREATIVE-123 ", unrelated: "ignore" },
        inputs,
      ),
    ).toEqual({ issue_link: "CREATIVE-123" });
    expect(pickPluginMetadata(undefined, inputs)).toBeUndefined();
    expect(pickPluginMetadata({ issue_link: " " }, inputs)).toBeUndefined();
  });

  it("combines configured fields with plugin inputs and de-duplicates names", () => {
    expect(
      getEnabledPluginCustomInputs(
        { creativeIssueLink: true },
        [
          { name: "url_link", label: "URL link", type: "url", required: true },
          { name: "issue_link", label: "Duplicate", type: "text", required: false },
        ],
      ),
    ).toMatchObject([
      { metadataName: "issue_link" },
      { metadataName: "url_link", label: "URL link", type: "url", required: true },
    ]);
  });
});
