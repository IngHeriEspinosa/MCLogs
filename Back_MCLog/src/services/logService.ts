import { Environment, LogLevel, Prisma } from '@prisma/client';
import { prisma } from '../config/prisma';

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
};

export const createLog = async (input: CreateLogInput) => {
    return prisma.log.create({
        data: input
    });
};

export const createLogsBatch = async (inputs: CreateLogInput[]) => {
    const result = await prisma.log.createMany({ data: inputs });
    return result.count;
};

type LogFilters = {
    application?: string;
    level?: string;
    environment?: string;
    search?: string;
    service?: string;
    host?: string;
    traceId?: string;
    from?: Date;
    to?: Date;
};

type Pagination = {
    page: number;
    pageSize: number;
};

type Sort = {
    field: 'timestamp' | 'level' | 'application' | 'host' | 'environment';
    direction: 'asc' | 'desc';
};

const buildWhere = (filters: LogFilters): Prisma.LogWhereInput => {
    const { application, level, environment, search, service, host, traceId, from, to } = filters;

    // from y to comparten la misma clave "timestamp": deben combinarse en un solo objeto
    const timestamp: Prisma.DateTimeFilter | undefined =
        from || to ? { ...(from && { gte: from }), ...(to && { lte: to }) } : undefined;

    return {
        ...(application && { application: { contains: application, mode: 'insensitive' } }),
        ...(service && { service: { contains: service, mode: 'insensitive' } }),
        ...(host && { host: { contains: host, mode: 'insensitive' } }),
        ...(traceId && { traceId }),
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

export const getLogStats = async () => {
    const since24h = new Date(Date.now() - 24 * 3600 * 1000);
    const [total, last24h, byLevel, byApplication, byEnvironment] = await Promise.all([
        prisma.log.count(),
        prisma.log.count({ where: { timestamp: { gte: since24h } } }),
        prisma.log.groupBy({ by: ['level'], _count: { _all: true }, orderBy: { level: 'asc' } }),
        prisma.log.groupBy({
            by: ['application'],
            _count: { _all: true },
            orderBy: { _count: { application: 'desc' } },
            take: 10
        }),
        prisma.log.groupBy({ by: ['environment'], _count: { _all: true }, orderBy: { environment: 'asc' } })
    ]);

    return {
        total,
        last24h,
        byLevel: byLevel.map((r) => ({ level: r.level, count: r._count._all })),
        byApplication: byApplication.map((r) => ({ application: r.application, count: r._count._all })),
        byEnvironment: byEnvironment.map((r) => ({ environment: r.environment, count: r._count._all }))
    };
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
