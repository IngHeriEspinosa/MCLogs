/**
 * Punto de entrada principal: solo el cliente REST, sin dependencias en runtime.
 *
 * El middleware Express (`validateLog`) vive en `@enviromentmc/mclog/express`
 * para no obligar a instalar express en proyectos que solo emiten logs.
 */

export { createMCLogClient } from './client';
export type {
    MCLogClient,
    MCLogClientOptions,
    MCLogEntry,
    MCLogInput,
    MCLogLevel,
    MCLogEnvironment,
} from './client';
