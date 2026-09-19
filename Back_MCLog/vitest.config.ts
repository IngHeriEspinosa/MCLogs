import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Solo las suites del backend. Sin esto, el glob por defecto arrastra
    // tambien las de log-service-lib, que tiene su propio proyecto, su propio
    // tsconfig y su propio `npm test`: se ejecutaban dos veces y el recuento
    // de esta suite mezclaba dos cosas distintas.
    include: ["tests/**/*.test.ts"],

    // Comparten una unica base de datos real, asi que no pueden solaparse.
    fileParallelism: false,
    maxWorkers: 1,
    pool: "threads",
  },
});
