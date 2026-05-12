import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["src/**/*.test.ts", "test/**/*.test.ts"],
    // Page-driven tests need a browser launch which can take ~5s; give them
    // headroom but fail fast on hangs.
    testTimeout: 30_000,
    hookTimeout: 60_000,
    pool: "forks",
    poolMatchGlobs: undefined,
    isolate: true,
    coverage: {
      provider: "v8",
      reporter: ["text", "html"],
      include: ["src/**/*.ts"],
      exclude: ["src/**/*.test.ts", "src/index.ts"],
    },
  },
});
