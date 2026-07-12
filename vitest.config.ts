import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    coverage: {
      provider: "v8",
      reporter: ["text"],
      include: [
        "src/api/**/*.ts",
        "src/integrations/issues/**/*.ts",
        "src/utils/**/*.ts",
      ],
      exclude: ["**/*.test.*"],
      thresholds: {
        statements: 38,
        branches: 60,
        functions: 45,
        lines: 38,
      },
    },
  },
});
