/**
 * Middleware Express opcional. Se importa desde `@enviromentmc/mclog/express`
 * para que quien solo use el cliente REST no arrastre express ni express-validator.
 *
 * Requiere los peer dependencies `express` y `express-validator`.
 */

import type { RequestHandler } from 'express';
import { body, validationResult } from 'express-validator';

// Middleware para manejar errores de validación
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

/**
 * Cadena de validación alineada con el contrato del servidor MCLog:
 * obligatorios application, level, environment y message; metadata es un objeto libre opcional.
 *
 * Se tipa como `RequestHandler[]` (un `ValidationChain` es estructuralmente un middleware)
 * para que Express infiera bien los tipos de `req`/`res` en el handler siguiente al
 * usarlo con spread: `app.post('/logs', ...validateLog, handler)`.
 */
export const validateLog: RequestHandler[] = [
    body('application')
        .trim()
        .notEmpty().withMessage('Application is required')
        .isString().withMessage('Application must be a string')
        .isLength({ max: 120 }).withMessage('Application must be at most 120 chars'),

    body('level')
        .trim()
        .notEmpty().withMessage('Level is required')
        .isIn(['debug', 'info', 'warn', 'error']).withMessage('Level must be one of: debug, info, warn, error'),

    body('environment')
        .trim()
        .notEmpty().withMessage('Environment is required')
        .isIn(['development', 'staging', 'production']).withMessage('Environment must be one of: development, staging, production'),

    body('message')
        .notEmpty().withMessage('Message is required')
        .isString().withMessage('Message must be a string'),

    body('service').optional().isString().withMessage('Service must be a string'),
    body('host').optional().isString().withMessage('Host must be a string'),
    body('traceId').optional().isString().withMessage('TraceId must be a string'),
    body('spanId').optional().isString().withMessage('SpanId must be a string'),

    body('metadata')
        .optional()
        .custom((value) => value === null || (typeof value === 'object' && !Array.isArray(value)))
        .withMessage('Metadata must be an object'),

    validField
];
