import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Solo las suites del backend, que viven todas en tests/.
    include: ["tests/**/*.test.ts"],

    // Comparten una unica base de datos real, asi que no pueden solaparse.
    fileParallelism: false,
    maxWorkers: 1,
    pool: "threads",

    // Los tests de autenticacion hacen bcrypt de verdad, y bcryptjs es JS puro:
    // a coste 12 cada hash o comparacion ronda el segundo. El de cambio de
    // contrasena encadena seis, asi que con los 5000 ms por defecto no fallaba
    // a veces: no llegaba nunca en una maquina de velocidad normal, y menos en
    // un runner de CI. No se baja el coste para que la prueba quepa: lo que se
    // mide tiene que ser el bcrypt que corre en produccion.
    testTimeout: 30000,
    hookTimeout: 30000,
  },
});
