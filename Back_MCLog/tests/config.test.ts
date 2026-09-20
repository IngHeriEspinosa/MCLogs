import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * assertProductionConfig es lo unico que separa un despliegue de produccion de
 * arrancar con los secretos de ejemplo, y no tenia ninguna prueba. Se ejecuta
 * antes de escuchar en el puerto, asi que fallar aqui es la unica forma de que
 * un despliegue mal configurado no llegue a servir.
 *
 * `config` lee process.env al cargar el modulo, de modo que cada caso monta su
 * entorno y vuelve a importarlo con vi.resetModules().
 */
const cargarConEntorno = async (env: Record<string, string | undefined>) => {
  vi.resetModules();
  for (const [clave, valor] of Object.entries(env)) {
    if (valor === undefined) delete process.env[clave];
    else process.env[clave] = valor;
  }
  return import("../src/config/env");
};

const entornoValido = {
  NODE_ENV: "production",
  API_KEY: "una-clave-de-verdad",
  JWT_ACCESS_SECRET: "un-secreto-de-acceso-de-verdad",
  JWT_REFRESH_SECRET: "un-secreto-de-refresco-de-verdad",
  CORS_ORIGINS: "https://mclog.ejemplo.com",
  ADMIN_PASSWORD: "una-contrasena-elegida",
};

describe("assertProductionConfig", () => {
  const original = { ...process.env };

  beforeEach(() => {
    process.env = { ...original };
  });

  afterEach(() => {
    process.env = { ...original };
    vi.resetModules();
  });

  it("no comprueba nada fuera de produccion", async () => {
    const { assertProductionConfig } = await cargarConEntorno({
      NODE_ENV: "development",
      API_KEY: "change-me",
      JWT_ACCESS_SECRET: "dev-access-secret",
      JWT_REFRESH_SECRET: "dev-refresh-secret",
      CORS_ORIGINS: undefined,
      ADMIN_PASSWORD: "ChangeMe123!",
    });
    expect(() => assertProductionConfig()).not.toThrow();
  });

  it("deja pasar una configuracion de produccion completa", async () => {
    const { assertProductionConfig } = await cargarConEntorno(entornoValido);
    expect(() => assertProductionConfig()).not.toThrow();
  });

  it.each([
    ["API_KEY", { API_KEY: "change-me" }, "API_KEY"],
    ["API_KEY de CI", { API_KEY: "dev-key" }, "API_KEY"],
    ["JWT_ACCESS_SECRET", { JWT_ACCESS_SECRET: "dev-access-secret" }, "JWT_ACCESS_SECRET"],
    ["JWT_REFRESH_SECRET", { JWT_REFRESH_SECRET: "dev-refresh-secret" }, "JWT_REFRESH_SECRET"],
    ["CORS_ORIGINS", { CORS_ORIGINS: undefined }, "CORS_ORIGINS"],
  ])("rechaza %s sin rotar", async (_nombre, override, esperado) => {
    const { assertProductionConfig } = await cargarConEntorno({ ...entornoValido, ...override });
    expect(() => assertProductionConfig()).toThrow(esperado);
  });

  /**
   * Hay dos ficheros de ejemplo con dos familias de marcadores, y la guia de
   * despliegue manda copiar el segundo. Reconocer solo los valores de
   * desarrollo dejaba pasar justo el camino que sigue un despliegue real.
   */
  it.each([
    ["API_KEY", "CAMBIAR-openssl-rand-hex-32"],
    ["JWT_ACCESS_SECRET", "CAMBIAR-openssl-rand-hex-32"],
    ["JWT_REFRESH_SECRET", "CAMBIAR-otro-distinto-openssl-rand-hex-32"],
    ["ADMIN_PASSWORD", "CAMBIAR-contrasena-fuerte"],
  ])("rechaza el marcador de deploy/.env.example en %s", async (clave, valor) => {
    const { assertProductionConfig } = await cargarConEntorno({
      ...entornoValido,
      [clave]: valor,
    });
    expect(() => assertProductionConfig()).toThrow(clave);
  });

  /**
   * Back_MCLog/.env.example viaja en el repositorio con
   * ADMIN_PASSWORD=ChangeMe123!, y ensureAdminUser() da de alta al
   * administrador con ese valor nada mas pasar esta comprobacion.
   */
  it.each(["ChangeMe123!", "changeme", "admin", "password", "  CambiaR-esto  "])(
    "rechaza ADMIN_PASSWORD de ejemplo: %s",
    async (contrasena) => {
      const { assertProductionConfig } = await cargarConEntorno({
        ...entornoValido,
        ADMIN_PASSWORD: contrasena,
      });
      expect(() => assertProductionConfig()).toThrow("ADMIN_PASSWORD");
    },
  );

  it("rechaza que los dos secretos JWT sean iguales", async () => {
    const { assertProductionConfig } = await cargarConEntorno({
      ...entornoValido,
      JWT_ACCESS_SECRET: "el-mismo-secreto-para-los-dos",
      JWT_REFRESH_SECRET: "el-mismo-secreto-para-los-dos",
    });
    // Con un solo secreto, un access token vale como refresh token.
    expect(() => assertProductionConfig()).toThrow("iguales");
  });

  it("no confunde un secreto legitimo que contenga la palabra", async () => {
    const { assertProductionConfig } = await cargarConEntorno({
      ...entornoValido,
      ADMIN_PASSWORD: "no-voy-a-cambiar-esta-clave-jamas",
    });
    expect(() => assertProductionConfig()).not.toThrow();
  });

  it("no exige ADMIN_PASSWORD si no se usa el alta automatica", async () => {
    const { assertProductionConfig } = await cargarConEntorno({
      ...entornoValido,
      ADMIN_PASSWORD: undefined,
    });
    expect(() => assertProductionConfig()).not.toThrow();
  });

  it("enumera todos los problemas de una vez, no solo el primero", async () => {
    const { assertProductionConfig } = await cargarConEntorno({
      NODE_ENV: "production",
      API_KEY: "change-me",
      JWT_ACCESS_SECRET: "dev-access-secret",
      JWT_REFRESH_SECRET: "dev-refresh-secret",
      CORS_ORIGINS: undefined,
      ADMIN_PASSWORD: "ChangeMe123!",
    });
    // Arreglar uno, reiniciar, descubrir el siguiente y repetir es el peor
    // rodeo posible en un despliegue: el mensaje los lista todos.
    try {
      assertProductionConfig();
      expect.unreachable("deberia haber lanzado");
    } catch (error) {
      const mensaje = (error as Error).message;
      for (const clave of [
        "API_KEY",
        "JWT_ACCESS_SECRET",
        "JWT_REFRESH_SECRET",
        "CORS_ORIGINS",
        "ADMIN_PASSWORD",
      ]) {
        expect(mensaje).toContain(clave);
      }
    }
  });
});
