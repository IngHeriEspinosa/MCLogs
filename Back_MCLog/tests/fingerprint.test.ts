import { describe, expect, it } from "vitest";
import { computeFingerprint, firstStackFrame, normalizeMessage, shouldFingerprint } from "../src/utils/fingerprint";

const base = { application: "facturacion", service: "pagos", message: "" };

describe("Normalizacion del mensaje", () => {
  it("sustituye lo que cambia entre ocurrencias del mismo error", () => {
    expect(normalizeMessage("Pedido 991 rechazado")).toBe("pedido <n> rechazado");
    expect(normalizeMessage("Fallo en https://api.pagos.com/v1/charge?id=7")).toBe("fallo en <url>");
    expect(normalizeMessage("No existe el usuario ana.lopez@example.com")).toBe("no existe el usuario <email>");
    expect(normalizeMessage("Traza 550e8400-e29b-41d4-a716-446655440000 perdida")).toBe("traza <uuid> perdida");
    expect(normalizeMessage('Campo "nombreCliente" vacio')).toBe("campo <str> vacio");
  });

  it("se queda con la primera linea", () => {
    expect(normalizeMessage("Error principal\n  at foo\n  at bar")).toBe("error principal");
  });

  it("colapsa espacios y normaliza mayusculas", () => {
    expect(normalizeMessage("  ERROR    Grave  ")).toBe("error grave");
  });

  it("reconoce correos pegados a signos de puntuacion", () => {
    expect(normalizeMessage("Aviso a (ana.lopez@example.com), bob+x@y.org;")).toBe("aviso a (<email>), <email>;");
  });

  /**
   * La regex de correos era cuadratica: 100 000 letras seguidas bloqueaban el
   * proceso 20 s, y con el todas las peticiones. El margen es amplio para no
   * fallar en un CI lento; antes se pasaba de largo.
   */
  it("tarda un tiempo lineal con un mensaje enorme sin espacios", () => {
    const inicio = performance.now();
    normalizeMessage("m".repeat(100000));
    expect(performance.now() - inicio).toBeLessThan(1000);
  });
});

describe("Primer marco del stack", () => {
  it("descarta numeros de linea y columna", () => {
    const stack = [
      "TypeError: cannot read properties of undefined",
      "    at cobrar (/app/src/pagos.js:42:15)",
      "    at procesar (/app/src/orden.js:10:3)",
    ].join("\n");
    expect(firstStackFrame(stack)).toBe("at cobrar (/app/src/pagos.js)");
  });

  it("no cambia aunque se desplacen las lineas al recompilar", () => {
    const antes = "Error: x\n    at cobrar (/app/src/pagos.js:42:15)";
    const despues = "Error: x\n    at cobrar (/app/src/pagos.js:87:9)";
    expect(firstStackFrame(antes)).toBe(firstStackFrame(despues));
  });

  it("acepta stacks que no usan el formato 'at ...', como los de NetSuite", () => {
    const stack = "createInvoiceRecord(/SuiteScripts/factura.js:88)\nafterSubmit(/SuiteScripts/factura.js:12)";
    expect(firstStackFrame(stack)).toBe("createinvoicerecord(/suitescripts/factura.js)");
  });
});

describe("Huella de agrupacion", () => {
  it("agrupa el mismo fallo aunque el mensaje lleve identificadores distintos", () => {
    const primera = computeFingerprint({ ...base, message: "Timeout cobrando el pedido 991" });
    const segunda = computeFingerprint({ ...base, message: "Timeout cobrando el pedido 1428" });
    expect(primera).toBe(segunda);
  });

  it("separa fallos realmente distintos", () => {
    const timeout = computeFingerprint({ ...base, message: "Timeout cobrando el pedido 991" });
    const rechazo = computeFingerprint({ ...base, message: "Tarjeta rechazada en el pedido 991" });
    expect(timeout).not.toBe(rechazo);
  });

  it("separa el mismo mensaje en aplicaciones o servicios distintos", () => {
    const enPagos = computeFingerprint({ ...base, message: "Timeout" });
    const enEnvios = computeFingerprint({ ...base, service: "envios", message: "Timeout" });
    const enOtraApp = computeFingerprint({ ...base, application: "ventas", message: "Timeout" });

    expect(enPagos).not.toBe(enEnvios);
    expect(enPagos).not.toBe(enOtraApp);
  });

  it("distingue por clase y codigo de error", () => {
    const sinDetalle = computeFingerprint({ ...base, message: "Fallo de red" });
    const conNombre = computeFingerprint({ ...base, message: "Fallo de red", errorName: "TypeError" });
    const conCodigo = computeFingerprint({ ...base, message: "Fallo de red", errorCode: "ECONNRESET" });

    expect(new Set([sinDetalle, conNombre, conCodigo]).size).toBe(3);
  });

  it("sigue agrupando cuando cambian los numeros de linea del stack", () => {
    const antes = computeFingerprint({
      ...base,
      message: "Fallo al cobrar el pedido 1",
      errorStack: "Error: x\n    at cobrar (/app/src/pagos.js:42:15)",
    });
    const despues = computeFingerprint({
      ...base,
      message: "Fallo al cobrar el pedido 2",
      errorStack: "Error: x\n    at cobrar (/app/src/pagos.js:87:9)",
    });
    expect(antes).toBe(despues);
  });

  it("separa el mismo mensaje lanzado desde sitios distintos del codigo", () => {
    const desdeCobrar = computeFingerprint({
      ...base,
      message: "Valor invalido",
      errorStack: "Error: x\n    at cobrar (/app/src/pagos.js:42:15)",
    });
    const desdeReembolsar = computeFingerprint({
      ...base,
      message: "Valor invalido",
      errorStack: "Error: x\n    at reembolsar (/app/src/pagos.js:120:4)",
    });
    expect(desdeCobrar).not.toBe(desdeReembolsar);
  });

  it("devuelve 32 caracteres hexadecimales y es determinista", () => {
    const huella = computeFingerprint({ ...base, message: "algo" });
    expect(huella).toMatch(/^[0-9a-f]{32}$/);
    expect(computeFingerprint({ ...base, message: "algo" })).toBe(huella);
  });
});

describe("Niveles que se agrupan", () => {
  it("solo agrupa errores y avisos", () => {
    expect(shouldFingerprint("error")).toBe(true);
    expect(shouldFingerprint("warn")).toBe(true);
    expect(shouldFingerprint("info")).toBe(false);
    expect(shouldFingerprint("debug")).toBe(false);
  });
});
