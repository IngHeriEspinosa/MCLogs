/**
 * Punto de entrada principal: el cliente REST y el contexto de traza, sin
 * dependencias en runtime (solo módulos de Node).
 *
 * El middleware Express (`validateLog`) vive en `@multicomputos-srl/mclog/express`
 * para no obligar a instalar express en proyectos que solo emiten logs.
 */

export { createMCLogClient, extractError } from './client';
export {
    formatTraceparent,
    getContext,
    newSpanId,
    newTraceId,
    parseTraceparent,
    traceContext,
    traceHeaders,
    withContext,
} from './context';
export type { MCLogContext, TraceContextOptions } from './context';
export type {
    MCLogCaptureOptions,
    MCLogChildOptions,
    MCLogClient,
    MCLogClientOptions,
    MCLogSpan,
    MCLogSpanEndOptions,
    MCLogSpanOptions,
    MCLogEntry,
    MCLogInput,
    MCLogLevel,
    MCLogEnvironment,
} from './client';
