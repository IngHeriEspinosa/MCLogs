/**
 * Contexto de traza por petición, con `AsyncLocalStorage` de Node.
 *
 * Lo que se guarda aquí (traceId, tramo actual, servicio, metadata) lo
 * completa el cliente en cada log emitido dentro del contexto, sin pasarlo a
 * mano de función en función. Es lo que permite que todos los logs de una
 * petición —y los de los servicios a los que llama— formen una sola traza.
 *
 * Solo usa módulos de Node (`node:async_hooks`, `node:crypto`): no añade
 * dependencias.
 */

import { AsyncLocalStorage } from 'node:async_hooks';
import { randomBytes } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';

export type MCLogContext = {
    traceId?: string | undefined;
    /** Tramo en curso: los logs emitidos dentro lo llevan como `spanId`. */
    spanId?: string | undefined;
    /** Tramo que contiene al actual. */
    parentSpanId?: string | undefined;
    service?: string | undefined;
    /** Se mezcla en la metadata de cada log; la del log tiene prioridad. */
    metadata?: Record<string, unknown> | undefined;
};

const storage = new AsyncLocalStorage<MCLogContext>();

/** El contexto activo, o undefined fuera de `withContext` y del middleware. */
export const getContext = (): MCLogContext | undefined => storage.getStore();

/**
 * Ejecuta `fn` con un contexto que hereda el actual: lo nuevo pisa campo a
 * campo (un campo `undefined` no borra el heredado) y la metadata se mezcla.
 * Devuelve lo que devuelva `fn`.
 */
export const withContext = <T>(context: MCLogContext, fn: () => T): T => {
    const parent = getContext();
    const defined = Object.fromEntries(Object.entries(context).filter(([, value]) => value !== undefined));
    const metadata =
        parent?.metadata || context.metadata ? { ...parent?.metadata, ...context.metadata } : undefined;
    return storage.run({ ...parent, ...defined, metadata }, fn);
};

/** traceId W3C: 32 caracteres hexadecimales. */
export const newTraceId = (): string => randomBytes(16).toString('hex');

/** spanId W3C: 16 caracteres hexadecimales. */
export const newSpanId = (): string => randomBytes(8).toString('hex');

/** W3C Trace Context: version-traceid-spanid-flags, en hexadecimal en minúsculas. */
const TRACEPARENT = /^[0-9a-f]{2}-([0-9a-f]{32})-([0-9a-f]{16})-[0-9a-f]{2}$/;
const W3C_TRACE_ID = /^[0-9a-f]{32}$/;
const W3C_SPAN_ID = /^[0-9a-f]{16}$/;

/**
 * traceId y spanId de una cabecera `traceparent`, o null si falta o no es
 * válida (la especificación prohíbe los identificadores todo ceros). Es la
 * misma regla que aplica el servidor MCLog a la ingesta.
 */
export const parseTraceparent = (value: unknown): { traceId: string; spanId: string } | null => {
    if (typeof value !== 'string') return null;
    const match = TRACEPARENT.exec(value.trim().toLowerCase());
    if (!match || !match[1] || !match[2] || /^0+$/.test(match[1]) || /^0+$/.test(match[2])) return null;
    return { traceId: match[1], spanId: match[2] };
};

/** Cabecera `traceparent` para un traceId y spanId W3C; null si alguno no lo es. */
export const formatTraceparent = (traceId: string, spanId: string): string | null =>
    W3C_TRACE_ID.test(traceId) && W3C_SPAN_ID.test(spanId) ? `00-${traceId}-${spanId}-01` : null;

/**
 * `x-trace-id` aceptable: lo que cabe en la columna del servidor (128) y solo
 * caracteres de identificador. Se devuelve en la respuesta, así que nada que
 * pueda colarse en una cabecera.
 */
const TRACE_ID_HEADER = /^[\w.:-]{1,128}$/;

/**
 * Cabeceras para propagar la traza activa a otro servicio (fetch, axios...):
 * `traceparent` si los identificadores son W3C y siempre `x-trace-id`, que es
 * la que entiende MCLog con cualquier formato. Vacío fuera de un contexto.
 */
export const traceHeaders = (): Record<string, string> => {
    const context = getContext();
    if (!context?.traceId) return {};
    const headers: Record<string, string> = { 'x-trace-id': context.traceId };
    const traceparent = context.spanId ? formatTraceparent(context.traceId, context.spanId) : null;
    if (traceparent) headers.traceparent = traceparent;
    return headers;
};

export type TraceContextOptions = {
    /** Servicio de los logs de esta app, si no se pone en el cliente. */
    service?: string | undefined;
    /** Devolver la traza en la respuesta (`traceparent` y `x-trace-id`). Default: true. */
    responseHeaders?: boolean | undefined;
};

/** Lo mínimo que se usa de la petición y la respuesta: vale Express, Connect o `http` a pelo. */
type MiddlewareRequest = Pick<IncomingMessage, 'headers'>;
type MiddlewareResponse = Pick<ServerResponse, 'setHeader' | 'headersSent'>;

/**
 * Middleware que abre un contexto de traza por petición.
 *
 * - Con `traceparent` (OpenTelemetry, otro servicio con esta librería), sigue
 *   esa traza y su tramo pasa a ser el padre del de esta petición.
 * - Si no, con `x-trace-id`, sigue ese identificador.
 * - Si no viene ninguno, empieza una traza nueva.
 *
 * Cada petición es un tramo propio (`spanId` nuevo), así que en la traza de
 * MCLog los logs de cada servicio quedan anidados bajo el que lo llamó.
 *
 *   app.use(traceContext({ service: 'checkout' }));
 */
export const traceContext = (options: TraceContextOptions = {}) => {
    const { service, responseHeaders = true } = options;

    return (req: MiddlewareRequest, res: MiddlewareResponse, next: (error?: unknown) => void): void => {
        const incoming = parseTraceparent(req.headers.traceparent);
        const header = req.headers['x-trace-id'];
        const traceIdHeader = typeof header === 'string' && TRACE_ID_HEADER.test(header) ? header : undefined;

        const traceId = incoming?.traceId ?? traceIdHeader ?? newTraceId();
        const spanId = newSpanId();

        if (responseHeaders && !res.headersSent) {
            res.setHeader('x-trace-id', traceId);
            const traceparent = formatTraceparent(traceId, spanId);
            if (traceparent) res.setHeader('traceparent', traceparent);
        }

        withContext({ traceId, spanId, parentSpanId: incoming?.spanId, service }, () => next());
    };
};
