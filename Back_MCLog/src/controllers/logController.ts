import { Environment, LogLevel } from '@prisma/client';
import { Request, Response } from 'express';
import logger from '../config/logger';
import { config } from '../config/env';
import type { AuthenticatedRequest } from '../middlewares/requireAuth';
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
 * Aplicaciones a las que esta limitada la peticion, si se autentico con una
 * API key acotada. `undefined` = sin restriccion.
 */
const allowedApplications = (req: Request): string[] | undefined => {
    const applications = (req as AuthenticatedRequest).apiKey?.applications;
    return applications && applications.length > 0 ? applications : undefined;
};

/**
 * Rechaza la peticion si intenta escribir logs de una aplicacion fuera del
 * alcance de la clave. Devuelve true si ya se ha respondido.
 */
const rejectedByScope = (applications: string[] | undefined, candidates: unknown[], res: Response): boolean => {
    if (!applications) return false;
    const forbidden = candidates.find((value) => typeof value === 'string' && !applications.includes(value));
    if (forbidden === undefined) return false;
    res.status(403).json({
        error: `API key not allowed for application "${String(forbidden)}"`,
        allowedApplications: applications
    });
    return true;
};

const toCreateInput = (body: Record<string, unknown>, req: Request, res: Response): CreateLogInput => {
    const { application, service, host, level, environment, message, timestamp, traceId, spanId, metadata } = body as any;
    return {
        application,
        service: service ?? application,
        host: host ?? req.hostname,
        level: level as LogLevel,
        environment: environment as Environment,
        message,
        timestamp: timestamp ? new Date(timestamp) : undefined,
        traceId: traceId ?? (res.locals.traceId as string | undefined),
        spanId,
        metadata: metadata ?? undefined
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

export const logBatch = async (req: Request, res: Response) => {
    const logs = req.body.logs as Record<string, unknown>[];
    if (logs.length > config.maxBatchSize) {
        res.status(400).json({ error: `Batch too large (max ${config.maxBatchSize} logs)` });
        return;
    }
    if (rejectedByScope(allowedApplications(req), logs.map((item) => item.application), res)) return;
    try {
        const inputs = logs.map((item) => toCreateInput(item, req, res));
        const count = await createLogsBatch(inputs);
        res.status(201).json({ created: count });
    } catch (error) {
        logger.error('Error creating log batch', { error });
        res.status(500).json({ error: 'Error creating log batch' });
    }
};

const csvEscape = (value: unknown) => {
    const str = value === null || value === undefined ? '' : String(value);
    return /[",\n\r]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
};

const parseFilters = (req: Request) => {
    const { application, level, environment, search, service, host, traceId, from, to } = req.query;
    return {
        application: application as string | undefined,
        level: level as string | undefined,
        environment: environment as string | undefined,
        search: search as string | undefined,
        service: service as string | undefined,
        host: host as string | undefined,
        traceId: traceId as string | undefined,
        from: from ? new Date(from as string) : undefined,
        to: to ? new Date(to as string) : undefined,
        applicationsIn: allowedApplications(req)
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
            const requested = parseInt((req.query.pageSize as string) ?? String(config.maxExportRows), 10);
            const limit = Math.min(Math.max(requested || config.maxExportRows, 1), config.maxExportRows);
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
        const logEntry = await getLogById(id);
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
    try {
        res.json(await getLogStats({ applicationsIn: allowedApplications(req) }));
    } catch (error) {
        logger.error('Error retrieving log stats', { error });
        res.status(500).json({ error: 'Error retrieving stats' });
    }
};

export const purgeLogs = async (req: Request, res: Response) => {
    const before = req.query.before as unknown as Date;
    const application = req.query.application as string | undefined;
    try {
        const deleted = await deleteLogsBefore(before, application);
        logger.info('Logs purged', { before, application, deleted });
        res.json({ deleted });
    } catch (error) {
        logger.error('Error purging logs', { error });
        res.status(500).json({ error: 'Error purging logs' });
    }
};
