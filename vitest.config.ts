import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["**/*.test.ts"],
    coverage: {
      provider: "v8",
      include: ["src/**/*.ts", "index.ts", "setup-entry.ts"],
      // Test fixtures and generated output are not product code.
      exclude: ["**/*.test.ts", "src/test-support/**"],
      reporter: ["text-summary", "json-summary"],
      /**
       * Ratchet, not an aspiration: these sit just below the level the suite
       * currently reaches, so coverage cannot silently regress. Raise them as
       * modules gain tests; never lower them to make a change pass.
       */
      thresholds: {
        statements: 68,
        branches: 63,
        functions: 60,
        lines: 68,
      },
    },
  },
});
