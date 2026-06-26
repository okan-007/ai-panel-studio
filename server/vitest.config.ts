import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Test file location (relative to this config)
    include: ["./src/**/*.test.ts"],
    root: ".",

    // Coverage configuration
    coverage: {
      provider: "v8",
      reporter: ["text", "json", "html", "lcov"],
      reportsDirectory: "./coverage",
      include: ["src/services/**/*.ts"],
      exclude: [
        "src/services/**/*.test.ts",
        "src/index.ts",
        "src/app.ts",
      ],
      thresholds: {
        lines: 80,
        branches: 75,
        functions: 80,
        statements: 80,
      },
      watermarks: {
        lines: [75, 90],
        branches: [70, 85],
        functions: [75, 90],
        statements: [75, 90],
      },
    },

    // Global settings
    globals: false,
    environment: "node",

    // Timeout for tests that mock API calls
    testTimeout: 10_000,
  },
});
