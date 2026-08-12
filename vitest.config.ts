import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    coverage: {
      provider: "v8",
      reporter: ["text"],
      include: ["src/**/*.{ts,tsx}"],
      exclude: ["**/*.test.*"],
      thresholds: {
        statements: 44,
        branches: 37,
        functions: 39,
        lines: 45,
      },
    },
  },
});
