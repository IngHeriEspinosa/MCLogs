/**
 * Middleware Express opcional. Se importa desde `@enviromentmc/mclog/express`
 * para que quien solo use el cliente REST no arrastre express ni express-validator.
 *
 * Requiere los peer dependencies `express` y `express-validator`.
 *
 * IMPORTANTE: estas reglas son un espejo de `src/middlewares/validateLog.ts`
 * del servidor MCLog. Las dos copias tienen que aceptar y rechazar exactamente
 * lo mismo: un validador que diverge del servidor es peor que no tener ninguno,
 * porque da por bueno lo que luego se rechaza y rechaza lo que se aceptaria.
 * Si tocas una regla alli, tocala aqui, y al reves. `tests/express.test.ts`
 * fija los casos frontera que ya se habian desincronizado una vez.
 */

import type { RequestHandler } from 'express';
import { body, validationResult } from 'express-validator';

const MAX_STACK_LENGTH = 50000;

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
 * Traslada un objeto `error` a los campos planos del log.
 *
 * Permite que quien emite escriba lo natural —pasar la excepción tal cual— en
 * lugar de descomponerla a mano en cuatro campos:
 *
 *   { message: "Fallo al facturar", error: { name, message, code, stack } }
 *
 * Los campos planos que ya vengan puestos tienen prioridad: el objeto `error`
 * completa, no pisa. Si no hay `message`, se toma el de la excepción, que es lo
 * que se quiere al registrar un `catch` sin más contexto.
 */
const flattenError = (entry: Record<string, unknown>) => {
    const error = entry.error;
    if (!error || typeof error !== 'object' || Array.isArray(error)) return;

    const source = error as Record<string, unknown>;

    if (entry.message === undefined && typeof source.message === 'string') {
        entry.message = source.message;
    }
    if (entry.errorName === undefined && typeof source.name === 'string') {
        entry.errorName = source.name;
    }
    if (
        entry.errorCode === undefined &&
        (typeof source.code === 'string' || typeof source.code === 'number')
    ) {
        entry.errorCode = String(source.code);
    }
    if (entry.errorStack === undefined) {
        // En NetSuite el stack llega como array de marcos, no como cadena.
        if (typeof source.stack === 'string') entry.errorStack = source.stack;
        else if (Array.isArray(source.stack)) entry.errorStack = source.stack.join('\n');
    }

    // Se descarta una vez volcado: no existe columna para él, y dejarlo
    // duplicaría la información dentro de metadata.
    delete entry.error;
};

/** Normaliza el cuerpo antes de validarlo, tanto para un log suelto como para un lote. */
export const normalizeErrorFields: RequestHandler = (req, _res, next) => {
    const payload = req.body as Record<string, unknown> | undefined;
    if (!payload || typeof payload !== 'object') return next();

    if (Array.isArray(payload.logs)) {
        for (const entry of payload.logs) {
            if (entry && typeof entry === 'object' && !Array.isArray(entry)) {
                flattenError(entry as Record<string, unknown>);
            }
        }
    } else {
        flattenError(payload);
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
        .notEmpty().withMessage('Message is required (or send error.message)')
        .isString().withMessage('Message must be a string')
        .isLength({ max: 100000 }).withMessage('Message must be at most 100000 chars'),

    body(`${prefix}service`).optional().isString().isLength({ max: 120 }).withMessage('Service must be a string (max 120)'),
    body(`${prefix}host`).optional().isString().isLength({ max: 255 }).withMessage('Host must be a string (max 255)'),
    body(`${prefix}timestamp`).optional().isISO8601().withMessage('Timestamp must be an ISO-8601 date'),
    body(`${prefix}traceId`).optional().isString().isLength({ max: 128 }).withMessage('TraceId must be a string (max 128)'),
    body(`${prefix}spanId`).optional().isString().isLength({ max: 128 }).withMessage('SpanId must be a string (max 128)'),

    // Detalle estructurado del error. Permite agrupar ocurrencias del mismo
    // fallo y darle a quien investiga el stack sin bucear en metadata.
    body(`${prefix}errorName`).optional().isString().isLength({ max: 200 }).withMessage('errorName must be a string (max 200)'),
    body(`${prefix}errorCode`)
        .optional()
        .customSanitizer((value) => (typeof value === 'number' ? String(value) : value))
        .isString()
        .isLength({ max: 100 })
        .withMessage('errorCode must be a string or number (max 100 chars)'),
    body(`${prefix}errorStack`)
        .optional()
        .isString()
        .isLength({ max: MAX_STACK_LENGTH })
        .withMessage(`errorStack must be a string (max ${MAX_STACK_LENGTH} chars)`),
    // Enviarla a mano permite agrupar con un criterio propio; si no, la calcula el servidor.
    body(`${prefix}fingerprint`).optional().isString().isLength({ max: 64 }).withMessage('fingerprint must be a string (max 64)'),

    body(`${prefix}metadata`)
        .optional()
        .custom((value) => value === null || (typeof value === 'object' && !Array.isArray(value)))
        .withMessage('Metadata must be an object'),
];

/**
 * Cadena de validación para una entrada suelta, alineada con `POST /api/log`.
 *
 * Se tipa como `RequestHandler[]` (un `ValidationChain` es estructuralmente un middleware)
 * para que Express infiera bien los tipos de `req`/`res` en el handler siguiente al
 * usarlo con spread: `app.post('/logs', ...validateLog, handler)`.
 */
export const validateLog: RequestHandler[] = [
    normalizeErrorFields,
    ...logFieldRules(),
    validField,
];

/**
 * Cadena de validación para un lote, alineada con `POST /api/logs/batch`.
 * El cuerpo es `{ logs: [...] }` y cada entrada sigue las mismas reglas.
 *
 * El tope de entradas por lote no se comprueba aquí: lo fija el servidor con
 * `MAX_BATCH_SIZE` y puede cambiar sin que este paquete se entere.
 */
export const validateLogBatch: RequestHandler[] = [
    normalizeErrorFields,
    body('logs')
        .isArray({ min: 1 }).withMessage('logs must be a non-empty array'),
    ...logFieldRules('logs.*.'),
    validField,
];
