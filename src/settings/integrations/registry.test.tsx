// @vitest-environment jsdom

import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { defaultSettings } from "../service";
import { INTEGRATIONS } from "./registry";

afterEach(cleanup);

describe("integration registry", () => {
  it("renders its icon and resolves every enabled-state variant", () => {
    const integration = INTEGRATIONS[0];
    const { container } = render(<>{integration.icon}</>);
    expect(container.querySelector("svg")).toBeTruthy();
    expect(integration.isEnabled(defaultSettings, "missing")).toBe(false);
    expect(integration.isEnabled({
      ...defaultSettings,
      issueIntegrations: { connection: { enabled: false } as never },
    }, "connection")).toBe(false);
    expect(integration.isEnabled({
      ...defaultSettings,
      issueIntegrations: { connection: { enabled: true } as never },
    }, "connection")).toBe(true);
    expect(integration.detail).toBeTypeOf("function");
  });
});
