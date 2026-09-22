import { RequestHandler } from "express";
import { param, query, validationResult, ValidationChain } from "express-validator";

const handle: RequestHandler = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    res.status(400).json({ status: "error", errors: errors.mapped() });
    return;
  }
  next();
};

export const validateLogQuery: Array<ValidationChain | RequestHandler> = [
  query("page").optional().isInt({ min: 1 }).toInt(),
  // 200 es el tope real que aplica el controlador: validarlo aqui evita
  // aceptar un valor que luego se recorta en silencio.
  query("pageSize").optional().isInt({ min: 1, max: 200 }).toInt(),
  query("from").optional().isISO8601().toDate(),
  query("to").optional().isISO8601().toDate(),
  query("sort").optional().matches(/^(timestamp|application|level|host|environment):(asc|desc)$/),
  query("level").optional().isIn(["debug", "info", "warn", "error"]),
  query("environment").optional().isIn(["development", "staging", "production"]),
  query("format").optional().isIn(["json", "csv", "ndjson"]),
  query("application").optional().isString().isLength({ max: 120 }),
  query("service").optional().isString().isLength({ max: 120 }),
  query("host").optional().isString().isLength({ max: 255 }),
  query("traceId").optional().isString().isLength({ max: 128 }),
  query("fingerprint").optional().isString().isLength({ max: 64 }),
  query("search").optional().isString().isLength({ max: 300 }),
  // Busqueda avanzada: cada campo por separado, en lugar de la busqueda libre.
  query("message").optional().isString().isLength({ max: 300 }),
  query("errorName").optional().isString().isLength({ max: 200 }),
  query("errorCode").optional().isString().isLength({ max: 100 }),
  handle,
];

/** Ventana relativa en horas, comun a grupos de error y estadisticas. */
const hoursRule = query("hours").optional().isInt({ min: 1, max: 24 * 31 }).toInt();

export const validateErrorGroups: Array<ValidationChain | RequestHandler> = [
  hoursRule,
  query("from").optional().isISO8601().toDate(),
  query("to").optional().isISO8601().toDate(),
  query("limit").optional().isInt({ min: 1, max: 100 }).toInt(),
  query("level").optional().isIn(["debug", "info", "warn", "error"]),
  query("environment").optional().isIn(["development", "staging", "production"]),
  query("application").optional().isString().isLength({ max: 120 }),
  query("service").optional().isString().isLength({ max: 120 }),
  handle
];

export const validateStatsQuery: Array<ValidationChain | RequestHandler> = [
  hoursRule,
  query("from").optional().isISO8601().toDate(),
  query("to").optional().isISO8601().toDate(),
  query("environment").optional().isIn(["development", "staging", "production"]),
  query("application").optional().isString().isLength({ max: 120 }),
  handle
];

/**
 * El inventario cuenta los errores de las ultimas 24 h: una ventana menor los
 * recortaria sin avisar, asi que ese es el minimo.
 */
export const validateApplications: Array<ValidationChain | RequestHandler> = [
  query("hours").optional().isInt({ min: 24, max: 24 * 31 }).withMessage("hours must be 24-744").toInt(),
  handle
];

export const validateTrace: Array<ValidationChain | RequestHandler> = [
  param("traceId").isString().isLength({ min: 1, max: 128 }).withMessage("traceId must be 1-128 chars"),
  handle
];

export const validateLogContext: Array<ValidationChain | RequestHandler> = [
  param("id").isInt({ min: 1 }).withMessage("id must be a positive integer").toInt(),
  query("before").optional().isInt({ min: 1, max: 3600 }).toInt(),
  query("after").optional().isInt({ min: 1, max: 3600 }).toInt(),
  query("limit").optional().isInt({ min: 1, max: 200 }).toInt(),
  handle
];

export const validateLogDelete: Array<ValidationChain | RequestHandler> = [
  query("before").notEmpty().withMessage("before is required").isISO8601().withMessage("before must be ISO-8601").toDate(),
  query("application").optional().isString().isLength({ max: 120 }),
  handle,
];
