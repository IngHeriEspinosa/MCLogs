import { RequestHandler } from "express";
import { query, validationResult, ValidationChain } from "express-validator";

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
  query("pageSize").optional().isInt({ min: 1, max: 500 }).toInt(),
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
  query("search").optional().isString().isLength({ max: 300 }),
  handle,
];

export const validateLogDelete: Array<ValidationChain | RequestHandler> = [
  query("before").notEmpty().withMessage("before is required").isISO8601().withMessage("before must be ISO-8601").toDate(),
  query("application").optional().isString().isLength({ max: 120 }),
  handle,
];
