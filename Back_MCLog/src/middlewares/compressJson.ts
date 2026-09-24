import { RequestHandler } from "express";
import { brotliCompress, constants, gzip } from "zlib";

/**
 * Comprime las respuestas JSON (brotli o gzip, lo que acepte el cliente).
 *
 * Un snapshot de 2000 logs, un listado largo o las estadisticas pesan megas y
 * se comprimen a una decima parte. Detras de Caddy ya se comprimia, pero con
 * la API en su propio dominio (CapRover, Railway) salia tal cual.
 *
 * Solo toca `res.json`, a proposito: el stream en vivo (SSE) y las descargas
 * CSV/NDJSON escriben por su cuenta, y comprimir un stream exige vaciar el
 * compresor en cada evento o los logs no llegarian hasta cerrar la conexion.
 * Sin dependencias: `zlib` viene con Node, y la compresion es asincrona para no
 * bloquear el bucle de eventos con un cuerpo grande.
 */

/** Por debajo, las cabeceras y el trabajo de comprimir cuestan mas de lo que se ahorra. */
export const COMPRESS_THRESHOLD_BYTES = 1024;

/** Calidad media: casi toda la ganancia de brotli, a una fraccion del coste del maximo (11). */
const BROTLI_QUALITY = 5;

const pickEncoding = (header: string | string[] | undefined): "br" | "gzip" | null => {
  const accepted = (Array.isArray(header) ? header.join(",") : header ?? "")
    .split(",")
    .map((part) => part.trim().split(";"))
    // "gzip;q=0" significa "no me lo mandes en gzip".
    .filter(([, quality]) => !/^\s*q=0(\.0*)?\s*$/.test(quality ?? ""))
    .map(([name]) => name.toLowerCase());
  if (accepted.includes("br")) return "br";
  if (accepted.includes("gzip") || accepted.includes("*")) return "gzip";
  return null;
};

export const compressJson: RequestHandler = (req, res, next) => {
  const encoding = pickEncoding(req.headers["accept-encoding"]);
  // La respuesta depende de la cabecera aunque este cliente no comprima: una
  // cache intermedia no debe servir la version comprimida a quien no la acepta.
  res.vary("Accept-Encoding");
  if (!encoding) return next();

  const json = res.json.bind(res);
  res.json = (body?: unknown) => {
    const text = JSON.stringify(body);
    if (text === undefined || Buffer.byteLength(text) < COMPRESS_THRESHOLD_BYTES || res.getHeader("Content-Encoding")) {
      return json(body);
    }
    const done = (error: Error | null, compressed: Buffer) => {
      if (error || res.headersSent) {
        // Si comprimir falla, mejor sin comprimir que sin respuesta.
        if (!res.headersSent) json(body);
        return;
      }
      res.setHeader("Content-Type", "application/json; charset=utf-8");
      res.setHeader("Content-Encoding", encoding);
      res.setHeader("Content-Length", compressed.length);
      res.end(compressed);
    };
    if (encoding === "br") {
      brotliCompress(text, { params: { [constants.BROTLI_PARAM_QUALITY]: BROTLI_QUALITY } }, done);
    } else {
      gzip(text, done);
    }
    return res;
  };
  next();
};
