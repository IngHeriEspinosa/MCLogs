import { Request, Response, NextFunction } from 'express';
import logger from '../config/logger';

// Registra una línea por petición al terminar la respuesta (método, ruta, status, duración).
// El body solo se registra en nivel debug y con campos sensibles redactados.
export const requestLogger = (req: Request, res: Response, next: NextFunction) => {
    const start = process.hrtime.bigint();

    res.on('finish', () => {
        const durationMs = Number(process.hrtime.bigint() - start) / 1e6;
        const entry = {
            requestId: res.locals.requestId,
            traceId: res.locals.traceId,
            method: req.method,
            url: req.originalUrl,
            status: res.statusCode,
            durationMs: Math.round(durationMs * 100) / 100,
        };

        if (logger.isDebugEnabled()) {
            const redactedKeys = ['password', 'token', 'authorization', 'auth', 'refreshtoken', 'accesstoken'];
            const safeBody = Object.fromEntries(
                Object.entries(req.body ?? {}).map(([key, value]) =>
                    redactedKeys.includes(key.toLowerCase()) ? [key, '[REDACTED]'] : [key, value]
                )
            );
            logger.debug({ ...entry, body: safeBody, query: req.query });
        } else {
            logger.info(entry);
        }
    });

    next();
};
