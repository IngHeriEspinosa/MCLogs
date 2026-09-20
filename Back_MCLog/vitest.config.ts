import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Solo las suites del backend, que viven todas en tests/.
    include: ["tests/**/*.test.ts"],

    // Comparten una unica base de datos real, asi que no pueden solaparse.
    fileParallelism: false,
    maxWorkers: 1,
    pool: "threads",
  },
});
