import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  test: {
    environment: "node",
    include: ["src/**/*.test.{ts,tsx}", "tests/**/*.test.{ts,tsx}"],
    exclude: [".claude/**", "node_modules/**", ".next/**", "e2e/**"],
    env: { NODE_ENV: "test" },
    // Generous timeouts and few workers: several agents run test suites on this machine at
    // the same time, and starting an in-process Postgres under load can take many seconds.
    testTimeout: 60_000,
    hookTimeout: 120_000,
    maxWorkers: 4,
  },
});
