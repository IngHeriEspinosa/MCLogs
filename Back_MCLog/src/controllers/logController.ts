import { Environment, LogLevel } from '@prisma/client';
import { Request, Response } from 'express';
import logger from '../config/logger';
import { logsRejected } from '../config/metrics';
import { workspaceIdOf } from '../middlewares/workspaceContext';
import { computeFingerprint, shouldFingerprint } from '../utils/fingerprint';
import { allowedApplications, filtersFromQuery } from './queryFilters';
import {
    TIMELINE_BUCKETS,
    TimelineBucketName,
    getLevelTimeline,
    timelineBucketSeconds
} from '../services/analysisService';
import { getSetting } from '../services/settingsService';
import {
    CreateLogInput,
    createLog,
    createLogsBatch,
    deleteLogsBefore,
    exportLogs,
    getLogById,
    getLogStats,
    listLogs
} from '../services/logService';

type SortField = 'timestamp' | 'level' | 'application' | 'host' | 'environment';
const allowedSortFields: readonly SortField[] = ['timestamp', 'level', 'application', 'host', 'environment'];

/**
 * Rechaza la peticion si intenta escribir logs de una aplicacion fuera del
 * alcance de la clave. Devuelve true si ya se ha respondido.
 */
const rejectedByScope = (applications: string[] | undefined, candidates: unknown[], res: Response): boolean => {
    if (!applications) return false;
    const forbidden = candidates.find((value) => typeof value === 'string' && !applications.includes(value));
    if (forbidden === undefined) return false;
    logsRejected.inc({ reason: 'scope' }, candidates.length);
    res.status(403).json({
        error: `API key not allowed for application "${String(forbidden)}"`,
        allowedApplications: applications
    });
    return true;
};

const toCreateInput = (body: Record<string, unknown>, req: Request, res: Response): CreateLogInput => {
    const {
        application,
        service,
        host,
        level,
        environment,
        message,
        timestamp,
        traceId,
        spanId,
        parentSpanId,
        durationMs,
        release,
        metadata,
        errorName,
        errorCode,
        errorStack,
        fingerprint
    } = body as any;

    const resolvedService = service ?? application;

    return {
        workspaceId: workspaceIdOf(req),
        application,
        service: resolvedService,
        host: host ?? req.hostname,
        level: level as LogLevel,
        environment: environment as Environment,
        message,
        timestamp: timestamp ? new Date(timestamp) : undefined,
        // Solo el traceId que manda el emisor, en el log o en la cabecera
        // x-trace-id. Antes se inventaba uno por peticion si faltaba: cada log
        // suelto era una "traza" de un registro, todo un lote compartia la misma
        // y la tasa por operacion contaba peticiones en lugar de operaciones.
        traceId: traceId ?? (res.locals.ingestTraceId as string | undefined),
        // Igual que el traceId: el del log o, si no trae, el de la cabecera traceparent.
        spanId: spanId ?? (res.locals.ingestSpanId as string | undefined),
        parentSpanId: parentSpanId ?? undefined,
        durationMs: durationMs ?? undefined,
        release: release ?? undefined,
        metadata: metadata ?? undefined,
        errorName: errorName ?? undefined,
        errorCode: errorCode ?? undefined,
        errorStack: errorStack ?? undefined,
        // Si el emisor no manda huella, se calcula aqui para errores y avisos.
        // Respetar la que venga permite agrupar con un criterio propio.
        fingerprint:
            fingerprint ??
            (shouldFingerprint(level)
                ? computeFingerprint({
                      application,
                      service: resolvedService,
                      message,
                      errorName,
                      errorCode,
                      errorStack
                  })
                : undefined)
    };
};

export const log = async (req: Request, res: Response) => {
    if (rejectedByScope(allowedApplications(req), [req.body?.application], res)) return;
    try {
        const newLog = await createLog(toCreateInput(req.body, req, res));
        res.status(201).json(newLog);
    } catch (error) {
        logger.error('Error creating log', { error });
        res.status(500).json({ error: 'Error creating log' });
    }
};

/**
 * Guarda un lote ya validado: el de `POST /api/logs/batch` y el que traduce
 * OTLP (`POST /v1/logs`). Si el lote no se puede guardar (demasiado grande,
 * fuera del alcance de la clave o un fallo) responde el error y devuelve null;
 * si no, devuelve cuantos se crearon y la respuesta queda para quien llama.
 */
export const persistBatch = async (
    logs: Record<string, unknown>[],
    req: Request,
    res: Response
): Promise<number | null> => {
    const maxBatchSize = getSetting('maxBatchSize');
    if (logs.length > maxBatchSize) {
        logsRejected.inc({ reason: 'batch_too_large' }, logs.length);
        res.status(400).json({ error: `Batch too large (max ${maxBatchSize} logs)` });
        return null;
    }
    if (rejectedByScope(allowedApplications(req), logs.map((item) => item.application), res)) return null;
    try {
        return await createLogsBatch(logs.map((item) => toCreateInput(item, req, res)));
    } catch (error) {
        logger.error('Error creating log batch', { error });
        res.status(500).json({ error: 'Error creating log batch' });
        return null;
    }
};

export const logBatch = async (req: Request, res: Response) => {
    const count = await persistBatch(req.body.logs as Record<string, unknown>[], req, res);
    if (count !== null) res.status(201).json({ created: count });
};

const csvEscape = (value: unknown) => {
    const str = value === null || value === undefined ? '' : String(value);
    return /[",\n\r]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
};

const parseFilters = (req: Request) => {
    const { from, to } = req.query;
    return {
        ...filtersFromQuery(req),
        from: from ? new Date(from as string) : undefined,
        to: to ? new Date(to as string) : undefined
    };
};

const parseSort = (req: Request) => {
    const [sortField, sortDirection] = ((req.query.sort as string | undefined)?.split(':') ?? ['timestamp', 'desc']);
    return {
        field: allowedSortFields.includes(sortField as SortField) ? (sortField as SortField) : 'timestamp',
        direction: sortDirection === 'asc' ? ('asc' as const) : ('desc' as const)
    };
};

export const getLogs = async (req: Request, res: Response) => {
    const format = (req.query.format as string) ?? 'json';
    const filters = parseFilters(req);
    const sort = parseSort(req);

    try {
        if (format === 'ndjson' || format === 'csv') {
            const maxExportRows = getSetting('maxExportRows');
            const requested = parseInt((req.query.pageSize as string) ?? String(maxExportRows), 10);
            const limit = Math.min(Math.max(requested || maxExportRows, 1), maxExportRows);
            const rows = await exportLogs(filters, limit, sort);

            if (format === 'ndjson') {
                res.type('application/x-ndjson');
                res.send(rows.map((item) => JSON.stringify(item)).join('\n'));
                return;
            }

            const header = ['id', 'timestamp', 'application', 'service', 'host', 'level', 'environment', 'message', 'traceId'];
            const lines = rows.map((r) =>
                [r.id, r.timestamp.toISOString(), r.application, r.service, r.host, r.level, r.environment, r.message, r.traceId]
                    .map(csvEscape)
                    .join(',')
            );
            res.type('text/csv');
            res.send([header.join(','), ...lines].join('\n'));
            return;
        }

        const page = Math.max(parseInt((req.query.page as string) ?? '1', 10), 1);
        const pageSize = Math.min(Math.max(parseInt((req.query.pageSize as string) ?? '20', 10), 1), 200);
        const result = await listLogs(filters, { page, pageSize }, sort);
        res.json(result);
    } catch (error) {
        logger.error('Error retrieving logs', { error });
        res.status(500).json({ error: 'Error retrieving logs' });
    }
};

export const getLog = async (req: Request, res: Response) => {
    const id = Number(req.params.id);
    if (Number.isNaN(id)) {
        res.status(400).json({ error: 'Invalid id' });
        return;
    }

    try {
        const logEntry = await getLogById(id, workspaceIdOf(req));
        const applications = allowedApplications(req);
        // Fuera de alcance se responde 404, no 403: un 403 confirmaria que el log existe.
        if (!logEntry || (applications && !applications.includes(logEntry.application))) {
            res.status(404).json({ error: 'Log not found' });
            return;
        }
        res.json(logEntry);
    } catch (error) {
        logger.error('Error retrieving log by id', { error, id });
        res.status(500).json({ error: 'Error retrieving log' });
    }
};

export const stats = async (req: Request, res: Response) => {
    // Los mismos filtros que el listado, para que un reporte acotado (a un
    // servicio, un host, un texto...) cuadre con los logs que se ven.
    const filters = filtersFromQuery(req);

    // Ventana de la linea temporal. Por defecto 24 h, que es lo que muestra el
    // dashboard.
    const to = req.query.to ? new Date(req.query.to as string) : new Date();
    const hours = Number(req.query.hours);
    const effectiveHours = Number.isFinite(hours) && hours > 0 ? Math.min(hours, 24 * 31) : 24;
    const from = req.query.from ? new Date(req.query.from as string) : new Date(to.getTime() - effectiveHours * 3600 * 1000);
    const bucket = req.query.bucket as TimelineBucketName | undefined;
    const bucketSeconds = bucket ? TIMELINE_BUCKETS[bucket] : timelineBucketSeconds(from, to);

    // Los totales siguen la ventana explicita: con `from`/`to`, los repartos
    // por entorno y aplicacion cuadran con el rango elegido, y no con todo el
    // historico. Solo con `hours` (o nada) siguen siendo los de la retencion.
    const summaryFilters = {
        ...filters,
        from: req.query.from ? from : undefined,
        to: req.query.to ? to : undefined
    };

    try {
        const [summary, timeline] = await Promise.all([
            getLogStats(summaryFilters),
            getLevelTimeline(filters, from, to, bucketSeconds)
        ]);
        res.json({ ...summary, timeline, bucketSeconds, from: from.toISOString(), to: to.toISOString() });
    } catch (error) {
        logger.error('Error retrieving log stats', { error });
        res.status(500).json({ error: 'Error retrieving stats' });
    }
};

export const purgeLogs = async (req: Request, res: Response) => {
    const before = req.query.before as unknown as Date;
    const application = req.query.application as string | undefined;
    try {
        const workspaceId = workspaceIdOf(req);
        const deleted = await deleteLogsBefore(workspaceId, before, application);
        logger.info('Logs purged', { workspaceId, before, application, deleted });
        res.json({ deleted });
    } catch (error) {
        logger.error('Error purging logs', { error });
        res.status(500).json({ error: 'Error purging logs' });
    }
};
