import { Request, Response, NextFunction } from 'express';
import logger from '../config/logger';
import { httpRequestDuration, routeLabel } from '../config/metrics';

/** A partir de aqui una peticion cuenta como lenta y se avisa aunque haya ido bien. */
export const SLOW_REQUEST_MS = 1000;

// El panel pregunta si hay sesion al cargar: sin ella, estos 401 son la respuesta
// esperada, no un fallo.
const EXPECTED_401 = new Set(['/auth/me', '/auth/refresh']);

// Conexiones que duran lo que la pestana abierta: su duracion no dice nada.
const LONG_LIVED = new Set(['/api/logs/stream']);

/**
 * Nivel de la linea de una peticion. Lo rutinario va a `http`, por debajo de
 * `info`: con el LOG_LEVEL=info de siempre no sale, y con LOG_LEVEL=http se ve
 * todo. Lo que merece atencion (fallos, lentitud) sale siempre.
 */
export const requestLogLevel = (path: string, status: number, durationMs: number) => {
    if (status >= 500) return 'error';
    if (durationMs >= SLOW_REQUEST_MS && !LONG_LIVED.has(path)) return 'warn';
    if (status >= 400 && !(status === 401 && EXPECTED_401.has(path))) return 'info';
    return 'http';
};

// Registra una línea por petición al terminar la respuesta (método, ruta, status, duración).
// El body solo se registra en nivel debug y con campos sensibles redactados.
export const requestLogger = (req: Request, res: Response, next: NextFunction) => {
    const start = process.hrtime.bigint();

    res.on('finish', () => {
        const durationMs = Number(process.hrtime.bigint() - start) / 1e6;

        httpRequestDuration.observe(
            {
                method: req.method,
                route: routeLabel(req.baseUrl, req.route?.path),
                status: String(res.statusCode)
            },
            durationMs / 1000
        );

        // originalUrl no cambia al pasar por los routers, a diferencia de req.path.
        const path = req.originalUrl.split('?')[0];

        // El HEALTHCHECK del contenedor pide /health cada 30 s: registrar cada
        // respuesta sana son miles de lineas al dia sin informacion. Solo se
        // registra cuando falla, que es cuando interesa. La metrica de arriba
        // sigue contando todas.
        if (path === '/health' && res.statusCode < 400) return;

        const level = requestLogLevel(path, res.statusCode, durationMs);
        if (!logger.isLevelEnabled(level)) return;

        const entry: Record<string, unknown> = {
            requestId: res.locals.requestId,
            traceId: res.locals.traceId,
            method: req.method,
            url: req.originalUrl,
            status: res.statusCode,
            durationMs: Math.round(durationMs * 100) / 100,
        };

        if (logger.isDebugEnabled()) {
            const redactedKeys = ['password', 'token', 'authorization', 'auth', 'refreshtoken', 'accesstoken'];
            entry.body = Object.fromEntries(
                Object.entries(req.body ?? {}).map(([key, value]) =>
                    redactedKeys.includes(key.toLowerCase()) ? [key, '[REDACTED]'] : [key, value]
                )
            );
            entry.query = req.query;
        }

        logger.log(level, 'HTTP request', entry);
    });

    next();
};
