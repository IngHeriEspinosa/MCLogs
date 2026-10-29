import { Request, RequestHandler, Response } from 'express';
import { logsRejected } from '../config/metrics';
import { translateOtlpLogs } from '../utils/otlp';
import { persistBatch } from './logController';

const PARTIAL_MESSAGE = 'Some log records were dropped: not a LogRecord object, or not stored';

/** Respuesta de OTLP: `{}` si entro todo; `partialSuccess` con lo que se descarto. */
const exportResponse = (rejected: number) =>
    rejected > 0 ? { partialSuccess: { rejectedLogRecords: rejected, errorMessage: PARTIAL_MESSAGE } } : {};

/**
 * Convierte el cuerpo OTLP en el `{ logs: [...] }` de un lote de MCLog, para
 * que pase por la misma normalizacion y validacion que `POST /api/logs/batch`.
 *
 * Solo JSON: el protobuf de OTLP pediria una dependencia nueva, y los SDK y
 * colectores permiten elegir `http/json` como protocolo.
 */
export const otlpToBatch: RequestHandler = (req, res, next) => {
    if (!req.is('application/json')) {
        res.status(415).json({
            error: 'Only OTLP/HTTP JSON is supported: set the exporter protocol to http/json (Content-Type: application/json)'
        });
        return;
    }
    const { logs, rejected } = translateOtlpLogs(req.body);
    if (rejected > 0) logsRejected.inc({ reason: 'otlp_malformed' }, rejected);
    // Un envio vacio es valido en OTLP; el validador de lotes lo rechazaria.
    if (logs.length === 0) {
        res.status(200).json(exportResponse(rejected));
        return;
    }
    req.body = { logs };
    res.locals.otlpRejected = rejected;
    next();
};

export const otlpLogs = async (req: Request, res: Response) => {
    const logs = req.body.logs as Record<string, unknown>[];
    const count = await persistBatch(logs, req, res);
    if (count === null) return;
    const rejected = (res.locals.otlpRejected as number) + (logs.length - count);
    res.status(200).json(exportResponse(rejected));
};
