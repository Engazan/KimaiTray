import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    coverage: {
      provider: "v8",
      reporter: ["text"],
      include: ["src/**/*.{ts,tsx}"],
      exclude: ["**/*.test.*"],
      thresholds: {
        statements: 54,
        branches: 46,
        functions: 51,
        lines: 55,
      },
    },
  },
});
