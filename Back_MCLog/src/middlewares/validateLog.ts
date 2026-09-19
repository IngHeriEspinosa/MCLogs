import { RequestHandler } from 'express';
import { body, validationResult, ValidationChain } from 'express-validator';

const validField: RequestHandler = (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        res.status(400).json({
            status: 'error',
            errors: errors.mapped(),
        });
        return;
    }
    next();
};

// Campos obligatorios mínimos; metadata es libre para que cualquier app pueda integrarse
const logFieldRules = (prefix = '') => [
    body(`${prefix}application`)
        .trim()
        .notEmpty().withMessage('Application is required')
        .isString().withMessage('Application must be a string')
        .isLength({ max: 120 }).withMessage('Application must be at most 120 chars'),

    body(`${prefix}level`)
        .trim()
        .notEmpty().withMessage('Level is required')
        .isIn(['debug', 'info', 'warn', 'error']).withMessage('Level must be one of: debug, info, warn, error'),

    body(`${prefix}environment`)
        .trim()
        .notEmpty().withMessage('Environment is required')
        .isIn(['development', 'staging', 'production']).withMessage('Environment must be one of: development, staging, production'),

    body(`${prefix}message`)
        .notEmpty().withMessage('Message is required')
        .isString().withMessage('Message must be a string')
        .isLength({ max: 100000 }).withMessage('Message must be at most 100000 chars'),

    body(`${prefix}service`).optional().isString().isLength({ max: 120 }).withMessage('Service must be a string (max 120)'),
    body(`${prefix}host`).optional().isString().isLength({ max: 255 }).withMessage('Host must be a string (max 255)'),
    body(`${prefix}timestamp`).optional().isISO8601().withMessage('Timestamp must be an ISO-8601 date'),
    body(`${prefix}traceId`).optional().isString().isLength({ max: 128 }).withMessage('TraceId must be a string (max 128)'),
    body(`${prefix}spanId`).optional().isString().isLength({ max: 128 }).withMessage('SpanId must be a string (max 128)'),

    body(`${prefix}metadata`)
        .optional()
        .custom((value) => value === null || (typeof value === 'object' && !Array.isArray(value)))
        .withMessage('Metadata must be an object'),
];

export const validateLog: Array<ValidationChain | RequestHandler> = [...logFieldRules(), validField];

export const validateLogBatch: Array<ValidationChain | RequestHandler> = [
    body('logs')
        .isArray({ min: 1 }).withMessage('logs must be a non-empty array'),
    ...logFieldRules('logs.*.'),
    validField,
];
