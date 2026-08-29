import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL(".", import.meta.url));

export default defineConfig({
  resolve: { alias: { "@": root } },
  test: {
    projects: [
      {
        resolve: { alias: { "@": root } },
        test: {
          name: "unit",
          environment: "node",
          include: ["tests/unit/**/*.test.ts"],
        },
      },
      {
        resolve: { alias: { "@": root } },
        test: {
          name: "components",
          environment: "jsdom",
          include: ["tests/components/**/*.test.tsx"],
          setupFiles: ["tests/setup/components.ts"],
          // Assert roles and text, not computed styles; parsing Tailwind in jsdom buys nothing.
          css: false,
          restoreMocks: true,
        },
      },
      {
        resolve: { alias: { "@": root } },
        test: {
          name: "integration",
          environment: "node",
          include: ["tests/integration/**/*.test.ts"],
          // Real commits and advisory locks: these must not interleave, so files run one at
          // a time in a single forked process rather than in parallel workers.
          pool: "forks",
          fileParallelism: false,
          maxWorkers: 1,
          testTimeout: 30_000,
          hookTimeout: 120_000,
        },
      },
    ],
    coverage: {
      provider: "v8",
      include: [
        "lib/domain/**/*.ts",
        "lib/draft/**/*.ts",
        "lib/format/**/*.ts",
        "lib/table/**/*.ts",
        "lib/api/**/*.ts",
      ],
      // lib/schemas is deliberately absent: it is declarative, so importing a schema "covers" it
      // without asserting anything, and a green number there would be theatre.
      exclude: ["lib/api/schema.d.ts"],
      // Scoped per directory rather than one global bar. A single global 100% over an empty
      // lib/domain means the first partially-covered file anywhere fails the run, and the failure
      // reads as a frontend problem. Layout components are excluded entirely.
      thresholds: {
        "lib/domain/**": { branches: 100, functions: 100, lines: 100, statements: 100 },
        "lib/draft/**": { branches: 100, functions: 100, lines: 100, statements: 100 },
        "lib/format/**": { branches: 95, functions: 100, lines: 95, statements: 95 },
        "lib/table/**": { branches: 90, functions: 90, lines: 90, statements: 90 },
        // client.ts and keys.ts hold real branching (envelope unwrap, error mapping, key
        // normalisation). Set at today's level to stop regression, not as an aspiration.
        "lib/api/**": { branches: 80, functions: 55, lines: 85, statements: 85 },
      },
    },
  },
});
