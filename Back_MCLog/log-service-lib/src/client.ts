/**
 * Cliente REST para enviar logs al servicio MCLog desde cualquier app Node.js (>=18).
 * Usa fetch nativo y autenticación por API key. Los errores de red no se propagan
 * por defecto: un fallo del servicio de logs no debe romper la aplicación emisora.
 */

export type MCLogLevel = 'debug' | 'info' | 'warn' | 'error';
export type MCLogEnvironment = 'development' | 'staging' | 'production';

export type MCLogEntry = {
    application: string;
    message: string;
    level: MCLogLevel;
    environment: MCLogEnvironment;
    service?: string;
    host?: string;
    timestamp?: string;
    traceId?: string;
    spanId?: string;
    metadata?: Record<string, unknown>;
};

/**
 * Entrada tal y como la escribe el usuario: solo `message` es obligatorio.
 * Los campos opcionales aceptan `undefined` explícito para que sea cómodo
 * construirlos desde variables que puedan no existir.
 */
export type MCLogInput = { [K in keyof MCLogEntry]?: MCLogEntry[K] | undefined } & {
    message: string;
};

export type MCLogClientOptions = {
    /** URL raíz del servicio MCLog, p. ej. https://mclog.tu-dominio.com */
    baseUrl: string;
    /** API key enviada en la cabecera `x-api-key` */
    apiKey: string;
    /** Nombre de aplicación por defecto para no repetirlo en cada llamada */
    application?: string | undefined;
    /** Entorno por defecto (default: 'development') */
    environment?: MCLogEnvironment | undefined;
    /** Servicio por defecto */
    service?: string | undefined;
    /** Host por defecto */
    host?: string | undefined;
    /** Metadata mezclada en toda entrada; la de cada llamada tiene prioridad */
    defaultMetadata?: Record<string, unknown> | undefined;
    /** Si true, los errores se lanzan en lugar de silenciarse (default: false) */
    throwOnError?: boolean | undefined;
    /** Timeout en ms para cada petición (default: 5000) */
    timeoutMs?: number | undefined;
    /** Máximo de entradas por petición en sendBatch; se trocea (default: 500) */
    maxBatchSize?: number | undefined;
    /** Cabeceras extra (p. ej. para un proxy o APM) */
    headers?: Record<string, string> | undefined;
    /**
     * Se invoca cuando un envío falla y `throwOnError` es false.
     * Por defecto no hace nada: una librería no debería escribir en tu consola.
     */
    onError?: ((error: Error) => void) | undefined;
    /** Implementación de fetch a usar (default: globalThis.fetch). Útil para tests y proxies. */
    fetch?: typeof globalThis.fetch | undefined;
};

export type MCLogClient = {
    /** Envía una entrada. Resuelve a true si el servicio la aceptó. */
    send: (entry: MCLogInput) => Promise<boolean>;
    /** Envía un lote, troceado en peticiones de `maxBatchSize`. True si todos los trozos fueron aceptados. */
    sendBatch: (entries: MCLogInput[]) => Promise<boolean>;
    debug: (message: string, metadata?: Record<string, unknown>) => Promise<boolean>;
    info: (message: string, metadata?: Record<string, unknown>) => Promise<boolean>;
    warn: (message: string, metadata?: Record<string, unknown>) => Promise<boolean>;
    error: (message: string, metadata?: Record<string, unknown>) => Promise<boolean>;
};

const chunk = <T>(items: T[], size: number): T[][] => {
    const out: T[][] = [];
    for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
    return out;
};

export const createMCLogClient = (options: MCLogClientOptions): MCLogClient => {
    const {
        baseUrl,
        apiKey,
        throwOnError = false,
        timeoutMs = 5000,
        maxBatchSize = 500,
        headers: extraHeaders,
        onError,
    } = options;

    if (typeof baseUrl !== 'string' || baseUrl.trim() === '') {
        throw new Error('createMCLogClient: `baseUrl` es obligatorio');
    }
    if (typeof apiKey !== 'string' || apiKey.trim() === '') {
        throw new Error('createMCLogClient: `apiKey` es obligatorio');
    }
    if (!Number.isFinite(maxBatchSize) || maxBatchSize < 1) {
        throw new Error('createMCLogClient: `maxBatchSize` debe ser >= 1');
    }

    const doFetch = options.fetch ?? globalThis.fetch;
    if (typeof doFetch !== 'function') {
        throw new Error(
            'createMCLogClient: no hay `fetch` disponible. Usa Node >=18 o pasa la opción `fetch`.',
        );
    }

    const root = baseUrl.trim().replace(/\/+$/, '');

    const fail = (error: Error): boolean => {
        if (throwOnError) throw error;
        onError?.(error);
        return false;
    };

    const post = async (path: string, payload: unknown): Promise<boolean> => {
        let response: Response;
        try {
            response = await doFetch(root + path, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'x-api-key': apiKey,
                    ...extraHeaders,
                },
                body: JSON.stringify(payload),
                signal: AbortSignal.timeout(timeoutMs),
            });
        } catch (cause) {
            const error = new Error(`MCLog: fallo enviando log a ${root}${path}`, { cause });
            return fail(error);
        }

        if (!response.ok) {
            const body = await response.text().catch(() => '');
            return fail(new Error(`MCLog HTTP ${response.status}: ${body}`));
        }
        return true;
    };

    const withDefaults = (entry: MCLogInput): MCLogEntry => {
        const metadata =
            options.defaultMetadata || entry.metadata
                ? { ...options.defaultMetadata, ...entry.metadata }
                : undefined;

        const merged: MCLogEntry = {
            application: entry.application ?? options.application ?? 'unknown-app',
            environment: entry.environment ?? options.environment ?? 'development',
            level: entry.level ?? 'info',
            message: entry.message,
        };

        const service = entry.service ?? options.service;
        const host = entry.host ?? options.host;
        if (service !== undefined) merged.service = service;
        if (host !== undefined) merged.host = host;
        if (entry.timestamp !== undefined) merged.timestamp = entry.timestamp;
        if (entry.traceId !== undefined) merged.traceId = entry.traceId;
        if (entry.spanId !== undefined) merged.spanId = entry.spanId;
        if (metadata !== undefined) merged.metadata = metadata;

        return merged;
    };

    const send = (entry: MCLogInput) => post('/api/log', withDefaults(entry));

    const sendBatch = async (entries: MCLogInput[]): Promise<boolean> => {
        if (!Array.isArray(entries) || entries.length === 0) return true;
        const results = await Promise.all(
            chunk(entries, maxBatchSize).map((batch) =>
                post('/api/logs/batch', { logs: batch.map(withDefaults) }),
            ),
        );
        return results.every(Boolean);
    };

    const level =
        (lvl: MCLogLevel) => (message: string, metadata?: Record<string, unknown>) =>
            send({ level: lvl, message, metadata });

    return {
        send,
        sendBatch,
        debug: level('debug'),
        info: level('info'),
        warn: level('warn'),
        error: level('error'),
    };
};
