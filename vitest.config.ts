import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "happy-dom",
    globals: true,
    include: ["tests/**/*.test.ts"],
    coverage: {
      provider: "v8",
      include: ["src/**/*.ts"],
      exclude: ["src/**/*.d.ts", "src/translations/**"],
      thresholds: {
        lines: 65,
        functions: 80,
        branches: 55,
        statements: 65,
      },
      reporter: ["text", "html"],
    },
  },
});
