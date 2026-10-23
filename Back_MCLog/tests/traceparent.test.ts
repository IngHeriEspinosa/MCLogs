import { describe, expect, it } from "vitest";
import { parseTraceparent } from "../src/middlewares/requestContext";

describe("Cabecera traceparent", () => {
  it("extrae traceId y spanId de una cabecera W3C valida", () => {
    expect(parseTraceparent("00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01")).toEqual({
      traceId: "4bf92f3577b34da6a3ce929d0e0e4736",
      spanId: "00f067aa0ba902b7",
    });
    // Mayusculas y espacios alrededor no la invalidan.
    expect(parseTraceparent(" 00-4BF92F3577B34DA6A3CE929D0E0E4736-00F067AA0BA902B7-01 ")?.spanId).toBe("00f067aa0ba902b7");
  });

  it("rechaza formatos invalidos e identificadores todo ceros", () => {
    expect(parseTraceparent(undefined)).toBeNull();
    expect(parseTraceparent("00-abc-def-01")).toBeNull();
    expect(parseTraceparent("00-00000000000000000000000000000000-00f067aa0ba902b7-01")).toBeNull();
    expect(parseTraceparent("00-4bf92f3577b34da6a3ce929d0e0e4736-0000000000000000-01")).toBeNull();
  });
});
