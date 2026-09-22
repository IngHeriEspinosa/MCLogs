import { Environment, LogLevel, Prisma } from '@prisma/client';
import { prisma } from '../config/prisma';
import { logsIngested } from '../config/metrics';
import { emitLogCreated } from '../events/logEvents';

export type CreateLogInput = {
    application: string;
    service?: string;
    host?: string;
    level: LogLevel;
    environment: Environment;
    message: string;
    timestamp?: Date;
    traceId?: string;
    spanId?: string;
    metadata?: Prisma.InputJsonValue;
    errorName?: string;
    errorCode?: string;
    errorStack?: string;
    /** Huella de agrupacion; ver src/utils/fingerprint.ts */
    fingerprint?: string;
};

/** Forma que viaja por el stream en vivo: sin metadata ni stack, que ahi no aportan. */
const toEvent = (input: CreateLogInput, id?: number) => ({
    ...(id !== undefined ? { id } : {}),
    timestamp: (input.timestamp ?? new Date()).toISOString(),
    application: input.application,
    service: input.service ?? null,
    host: input.host ?? null,
    level: input.level as string,
    environment: input.environment as string,
    message: input.message,
    traceId: input.traceId ?? null,
    errorName: input.errorName ?? null,
    fingerprint: input.fingerprint ?? null
});

export const createLog = async (input: CreateLogInput) => {
    const created = await prisma.log.create({ data: input });
    logsIngested.inc({ application: input.application, level: input.level });
    emitLogCreated(toEvent(input, created.id));
    return created;
};

export const createLogsBatch = async (inputs: CreateLogInput[]) => {
    const result = await prisma.log.createMany({ data: inputs });
    // Se cuenta lo insertado, no lo recibido: createMany puede descartar filas.
    if (result.count === inputs.length) {
        for (const input of inputs) {
            logsIngested.inc({ application: input.application, level: input.level });
            // Sin id: createMany no devuelve las filas creadas.
            emitLogCreated(toEvent(input));
        }
    }
    return result.count;
};

export type LogFilters = {
    application?: string;
    level?: string;
    environment?: string;
    search?: string;
    service?: string;
    host?: string;
    traceId?: string;
    fingerprint?: string;
    /** Busqueda avanzada: texto contenido solo en el mensaje. */
    message?: string;
    errorName?: string;
    errorCode?: string;
    from?: Date;
    to?: Date;
    /**
     * Restriccion de visibilidad, no un filtro del usuario: limita la consulta a
     * estas aplicaciones exactas. La imponen las API keys acotadas y se combina
     * con el resto de filtros mediante AND, de modo que no se puede eludir.
     */
    applicationsIn?: string[];
};

type Pagination = {
    page: number;
    pageSize: number;
};

type Sort = {
    field: 'timestamp' | 'level' | 'application' | 'host' | 'environment';
    direction: 'asc' | 'desc';
};

export const buildWhere = (filters: LogFilters): Prisma.LogWhereInput => {
    const {
        application, level, environment, search, service, host, traceId, fingerprint, message, errorName, errorCode,
        from, to, applicationsIn
    } = filters;

    // from y to comparten la misma clave "timestamp": deben combinarse en un solo objeto
    const timestamp: Prisma.DateTimeFilter | undefined =
        from || to ? { ...(from && { gte: from }), ...(to && { lte: to }) } : undefined;

    const where: Prisma.LogWhereInput = {
        ...(application && { application: { contains: application, mode: 'insensitive' } }),
        ...(service && { service: { contains: service, mode: 'insensitive' } }),
        ...(host && { host: { contains: host, mode: 'insensitive' } }),
        ...(traceId && { traceId }),
        ...(fingerprint && { fingerprint }),
        ...(message && { message: { contains: message, mode: 'insensitive' } }),
        ...(errorName && { errorName: { contains: errorName, mode: 'insensitive' } }),
        ...(errorCode && { errorCode: { contains: errorCode, mode: 'insensitive' } }),
        ...(level && { level: level as LogLevel }),
        ...(environment && { environment: environment as Environment }),
        ...(timestamp && { timestamp }),
        ...(search && {
            OR: [
                { message: { contains: search, mode: 'insensitive' } },
                { application: { contains: search, mode: 'insensitive' } },
                { service: { contains: search, mode: 'insensitive' } },
                { host: { contains: search, mode: 'insensitive' } },
                { traceId: { equals: search } }
            ]
        })
    };

    // La restriccion por aplicacion va en un AND aparte: la clave "application"
    // ya puede estar ocupada por el filtro parcial del usuario.
    if (applicationsIn?.length) {
        return { AND: [where, { application: { in: applicationsIn } }] };
    }
    return where;
};

export const listLogs = async (filters: LogFilters, pagination: Pagination, sort: Sort) => {
    const { page, pageSize } = pagination;
    const skip = (page - 1) * pageSize;
    const where = buildWhere(filters);

    const [data, total] = await prisma.$transaction([
        prisma.log.findMany({
            where,
            orderBy: { [sort.field]: sort.direction },
            skip,
            take: pageSize
        }),
        prisma.log.count({ where })
    ]);

    return {
        data,
        page,
        pageSize,
        total,
        totalPages: Math.max(1, Math.ceil(total / pageSize))
    };
};

export const exportLogs = async (filters: LogFilters, limit: number, sort: Sort) => {
    return prisma.log.findMany({
        where: buildWhere(filters),
        orderBy: { [sort.field]: sort.direction },
        take: limit
    });
};

export const getLogById = async (id: number) => {
    return prisma.log.findUnique({ where: { id } });
};

export const getLogStats = async (filters: LogFilters = {}) => {
    const since24h = new Date(Date.now() - 24 * 3600 * 1000);
    const where = buildWhere(filters);
    const where24h: Prisma.LogWhereInput = { AND: [where, { timestamp: { gte: since24h } }] };

    const [total, last24h, byLevel, byApplication, byEnvironment] = await Promise.all([
        prisma.log.count({ where }),
        prisma.log.count({ where: where24h }),
        prisma.log.groupBy({ by: ['level'], where, _count: { _all: true }, orderBy: { level: 'asc' } }),
        prisma.log.groupBy({
            by: ['application'],
            where,
            _count: { _all: true },
            orderBy: { _count: { application: 'desc' } },
            take: 10
        }),
        prisma.log.groupBy({ by: ['environment'], where, _count: { _all: true }, orderBy: { environment: 'asc' } })
    ]);

    return {
        total,
        last24h,
        byLevel: byLevel.map((r) => ({ level: r.level, count: r._count._all })),
        byApplication: byApplication.map((r) => ({ application: r.application, count: r._count._all })),
        byEnvironment: byEnvironment.map((r) => ({ environment: r.environment, count: r._count._all }))
    };
};

/**
 * Borra en lotes los logs anteriores a una fecha. Un unico DELETE masivo sobre
 * una tabla de millones de filas mantiene el bloqueo demasiado tiempo y compite
 * con la ingesta, asi que se trocea y se cede el control entre lotes.
 */
export const deleteLogsOlderThanInBatches = async (
    before: Date,
    batchSize = 5000,
    maxBatches = 1000
): Promise<number> => {
    let deleted = 0;
    for (let batch = 0; batch < maxBatches; batch++) {
        const rows = await prisma.log.findMany({
            where: { timestamp: { lt: before } },
            select: { id: true },
            take: batchSize
        });
        if (rows.length === 0) break;

        const result = await prisma.log.deleteMany({ where: { id: { in: rows.map((row) => row.id) } } });
        deleted += result.count;

        if (rows.length < batchSize) break;
        // Respiro entre lotes para no monopolizar la base de datos.
        await new Promise((resolve) => setImmediate(resolve));
    }
    return deleted;
};

export const deleteLogsBefore = async (before: Date, application?: string) => {
    const result = await prisma.log.deleteMany({
        where: {
            timestamp: { lt: before },
            ...(application && { application })
        }
    });
    return result.count;
};
