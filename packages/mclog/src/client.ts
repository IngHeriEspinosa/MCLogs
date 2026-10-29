/**
 * Cliente REST para enviar logs al servicio MCLog desde cualquier app Node.js (>=18).
 * Usa fetch nativo y autenticación por API key. Los errores de red no se propagan
 * por defecto: un fallo del servicio de logs no debe romper la aplicación emisora.
 *
 * Dentro de un contexto de traza (`traceContext`, `withContext` o el `run` de un
 * tramo) cada log toma de él el traceId, el tramo, el servicio y la metadata.
 */

import { getContext, newSpanId, newTraceId, withContext } from './context';

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
    /** Tramo que contiene a este, para anidar los pasos de una traza. */
    parentSpanId?: string;
    /** Duración del paso en milisegundos. */
    durationMs?: number;
    /** Versión desplegada que emite el log ("2.4.1", un commit…). */
    release?: string;
    metadata?: Record<string, unknown>;
    /** Clase de la excepción, p. ej. "TypeError". */
    errorName?: string;
    /** Código de error de la aplicación o del proveedor, p. ej. "ECONNRESET". */
    errorCode?: string;
    errorStack?: string;
    /**
     * Huella de agrupación. Si no se envía, el servidor la calcula para los
     * niveles `error` y `warn`. Mandarla permite agrupar con criterio propio.
     */
    fingerprint?: string;
};

/**
 * Entrada tal y como la escribe el usuario: solo `message` es obligatorio.
 * Los campos opcionales aceptan `undefined` explícito para que sea cómodo
 * construirlos desde variables que puedan no existir.
 */
export type MCLogInput = { [K in keyof MCLogEntry]?: MCLogEntry[K] | undefined } & {
    message: string;
    /**
     * Excepción capturada. Acepta un `Error` nativo o cualquier objeto con
     * `name`, `message`, `code` o `stack`, y se reparte en los campos
     * `errorName`, `errorCode` y `errorStack`. Los campos que se hayan puesto
     * a mano tienen prioridad.
     */
    error?: unknown;
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
    /**
     * Versión desplegada que se pone en cada log (default: la variable de
     * entorno `MCLOG_RELEASE`). Con ella, MCLog dice qué release estrenó cada fallo.
     */
    release?: string | undefined;
    /** Si true, los errores se lanzan en lugar de silenciarse (default: false) */
    throwOnError?: boolean | undefined;
    /** Timeout en ms para cada intento (default: 5000) */
    timeoutMs?: number | undefined;
    /** Máximo de entradas por petición en sendBatch; se trocea (default: 500) */
    maxBatchSize?: number | undefined;
    /**
     * Máximo de bytes del cuerpo de cada petición de sendBatch (default: 1 MiB).
     * Tiene que quedar por debajo del `BODY_LIMIT` del servidor (3 MB por
     * defecto): un trozo que lo pase recibe un 413 y se pierde entero. 1 MiB
     * deja margen y cabe también en el límite por defecto de nginx.
     */
    maxBatchBytes?: number | undefined;
    /**
     * Reintentos tras el primer intento ante un fallo recuperable (default: 2).
     * 0 lo desactiva. Ver `retryBaseMs` para la espera entre intentos.
     */
    maxRetries?: number | undefined;
    /**
     * Base de la espera exponencial con jitter entre reintentos, en ms
     * (default: 300 → ~300, ~600, ~1200...). El `Retry-After` que mande el
     * servidor en un 429 tiene prioridad sobre este cálculo.
     */
    retryBaseMs?: number | undefined;
    /**
     * Trozos de `sendBatch` enviados a la vez (default: 1, en serie).
     * Subirlo acelera lotes grandes a costa de acercarte al límite de ingesta.
     */
    batchConcurrency?: number | undefined;
    /** Cabeceras extra (p. ej. para un proxy o APM) */
    headers?: Record<string, string> | undefined;
    /**
     * Se invoca cuando un envío falla definitivamente, agotados los reintentos,
     * y `throwOnError` es false. Por defecto no hace nada: una librería no
     * debería escribir en tu consola.
     */
    onError?: ((error: Error) => void) | undefined;
    /**
     * Se invoca antes de cada reintento. Sirve para instrumentar: un servicio
     * que reintenta a menudo está avisando de que la ingesta va justa.
     */
    onRetry?: ((info: { attempt: number; delayMs: number; error: Error }) => void) | undefined;
    /** Implementación de fetch a usar (default: globalThis.fetch). Útil para tests y proxies. */
    fetch?: typeof globalThis.fetch | undefined;
};

/** Lo que un cliente hijo (`child`) cambia respecto al padre. */
export type MCLogChildOptions = {
    application?: string | undefined;
    environment?: MCLogEnvironment | undefined;
    service?: string | undefined;
    host?: string | undefined;
    release?: string | undefined;
    /** Se mezcla con la `defaultMetadata` del padre. */
    metadata?: Record<string, unknown> | undefined;
};

/** Opciones de `startSpan`. */
export type MCLogSpanOptions = {
    service?: string | undefined;
    /** Metadata de todos los logs del tramo, también el de cierre. */
    metadata?: Record<string, unknown> | undefined;
};

/** Opciones del log de cierre de un tramo. */
export type MCLogSpanEndOptions = Omit<MCLogInput, 'message' | 'traceId' | 'spanId' | 'parentSpanId' | 'durationMs'> & {
    /** Mensaje del log de cierre. Por defecto, el nombre del tramo. */
    message?: string | undefined;
};

/**
 * Un paso de una operación, con su duración. `run` ejecuta código dentro del
 * tramo (sus logs y sus tramos hijos lo llevan) y `end` registra el cierre.
 */
export type MCLogSpan = {
    traceId: string;
    spanId: string;
    run: <T>(fn: () => T) => T;
    /**
     * Envía el log de cierre con `durationMs` desde `startSpan`. Con `error`, en
     * nivel `error` y con la excepción desglosada. Solo cuenta la primera vez:
     * las siguientes resuelven a false sin enviar nada.
     */
    end: (options?: MCLogSpanEndOptions) => Promise<boolean>;
};

/** Opciones de `captureException`, todas opcionales. */
export type MCLogCaptureOptions = Omit<Partial<MCLogEntry>, 'message'> & {
    /** Mensaje propio. Por defecto se usa el de la excepción. */
    message?: string | undefined;
};

export type MCLogClient = {
    /** Envía una entrada. Resuelve a true si el servicio la aceptó. */
    send: (entry: MCLogInput) => Promise<boolean>;
    /**
     * Envía un lote, troceado en peticiones de `maxBatchSize` entradas y
     * `maxBatchBytes` bytes como mucho. True si todos los trozos fueron aceptados.
     */
    sendBatch: (entries: MCLogInput[]) => Promise<boolean>;
    /**
     * Registra una excepción con su clase, código y stack, de modo que el
     * servicio pueda agrupar sus repeticiones. Es el atajo para un `catch`:
     *
     *   try { ... } catch (err) { await mclog.captureException(err); }
     */
    captureException: (error: unknown, options?: MCLogCaptureOptions) => Promise<boolean>;
    debug: (message: string, metadata?: Record<string, unknown>) => Promise<boolean>;
    info: (message: string, metadata?: Record<string, unknown>) => Promise<boolean>;
    warn: (message: string, metadata?: Record<string, unknown>) => Promise<boolean>;
    error: (message: string, metadata?: Record<string, unknown>) => Promise<boolean>;
    /**
     * Cliente con otros valores por defecto (servicio, metadata...) que comparte
     * la conexión y las opciones de envío. Para un módulo o un trabajo concreto:
     *
     *   const billing = mclog.child({ service: 'billing', metadata: { queue: 'invoices' } });
     */
    child: (overrides: MCLogChildOptions) => MCLogClient;
    /**
     * Abre un tramo dentro de la traza activa (o de una nueva):
     *
     *   const span = mclog.startSpan('charge-card');
     *   try { await span.run(() => charge()); await span.end(); }
     *   catch (error) { await span.end({ error }); throw error; }
     */
    startSpan: (name: string, options?: MCLogSpanOptions) => MCLogSpan;
};

/** Campos que se pueden sacar de una excepción capturada. */
type ExtractedError = {
    errorName?: string;
    errorCode?: string;
    errorStack?: string;
    message?: string;
};

/**
 * Reparte una excepción en campos planos.
 *
 * Acepta un `Error` nativo, un objeto suelto con esa forma o una cadena, que
 * es lo que suele llegar a un `catch` en JavaScript, donde se puede lanzar
 * cualquier cosa.
 */
export const extractError = (error: unknown): ExtractedError => {
    if (error === null || error === undefined) return {};
    if (typeof error === 'string') return { message: error };
    if (typeof error !== 'object') return { message: String(error) };

    const source = error as Record<string, unknown>;
    const extracted: ExtractedError = {};

    if (typeof source.name === 'string') extracted.errorName = source.name;
    if (typeof source.message === 'string') extracted.message = source.message;
    if (typeof source.code === 'string' || typeof source.code === 'number') {
        extracted.errorCode = String(source.code);
    }
    // Algunos entornos (NetSuite) entregan el stack como array de marcos.
    if (typeof source.stack === 'string') extracted.errorStack = source.stack;
    else if (Array.isArray(source.stack)) extracted.errorStack = source.stack.join('\n');

    return extracted;
};

const chunk = <T>(items: T[], size: number): T[][] => {
    const out: T[][] = [];
    for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
    return out;
};

const encoder = new TextEncoder();

/** Tamaño en UTF-8, que es lo que mide el límite de cuerpo del servidor. */
const byteLength = (text: string): number => encoder.encode(text).length;

/** Envoltorio que espera `POST /api/logs/batch`: `{"logs":[...]}`. */
const BATCH_PREFIX = '{"logs":[';
const BATCH_SUFFIX = ']}';

/**
 * Agrupa entradas ya serializadas en cuerpos de lote que respetan a la vez el
 * tope de entradas y el de bytes.
 *
 * Trocear solo por número no basta: 500 errores con stacks de unos 7 KB pesan
 * 4 MB, el servidor responde 413 y el trozo se pierde entero. Una entrada que
 * por sí sola pase de `maxBytes` va en un cuerpo propio: si el servidor la
 * rechaza, no arrastra a las demás.
 */
const packBatches = (serialized: string[], maxCount: number, maxBytes: number): string[] => {
    const bodies: string[] = [];
    const emptyBytes = BATCH_PREFIX.length + BATCH_SUFFIX.length;
    let current: string[] = [];
    let currentBytes = emptyBytes;

    const flush = () => {
        bodies.push(BATCH_PREFIX + current.join(',') + BATCH_SUFFIX);
        current = [];
        currentBytes = emptyBytes;
    };

    for (const entry of serialized) {
        const bytes = byteLength(entry);
        // El +1 es la coma que la separa de la anterior.
        if (current.length > 0 && (current.length >= maxCount || currentBytes + 1 + bytes > maxBytes)) {
            flush();
        }
        currentBytes += (current.length > 0 ? 1 : 0) + bytes;
        current.push(entry);
    }
    if (current.length > 0) flush();

    return bodies;
};

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/** `MCLOG_RELEASE` del entorno, si existe y no está vacía. */
const releaseFromEnv = (): string | undefined => {
    const value = typeof process !== 'undefined' ? process.env.MCLOG_RELEASE?.trim() : undefined;
    return value ? value : undefined;
};

/** Copia sin las claves `undefined`, para que no pisen lo heredado al mezclar. */
const definedOnly = <T extends Record<string, unknown>>(value: T): Partial<T> =>
    Object.fromEntries(Object.entries(value).filter(([, field]) => field !== undefined)) as Partial<T>;

/**
 * Códigos que merecen otro intento: el servicio está saturado, caído o
 * reiniciándose, y el mismo cuerpo puede entrar dentro de un momento.
 *
 * Un 4xx queda fuera a propósito. Un 400 de validación, un 401 con clave mala
 * o un 403 por aplicación fuera de alcance no se arreglan repitiendo: dan la
 * misma respuesta y solo gastan cuota.
 */
const isRetryableStatus = (status: number): boolean =>
    status === 429 || status === 408 || (status >= 500 && status <= 599);

/**
 * Lee el `Retry-After` de un 429. Admite las dos formas del estándar: segundos
 * de espera o fecha HTTP. Devuelve undefined si no viene o no se entiende, y
 * entonces manda la espera exponencial.
 */
const parseRetryAfter = (value: string | null): number | undefined => {
    if (!value) return undefined;

    const seconds = Number(value.trim());
    if (Number.isFinite(seconds) && seconds >= 0) return seconds * 1000;

    const date = Date.parse(value);
    if (Number.isNaN(date)) return undefined;
    return Math.max(0, date - Date.now());
};

export const createMCLogClient = (options: MCLogClientOptions): MCLogClient => {
    const {
        baseUrl,
        apiKey,
        throwOnError = false,
        timeoutMs = 5000,
        maxBatchSize = 500,
        maxBatchBytes = 1024 * 1024,
        maxRetries = 2,
        retryBaseMs = 300,
        batchConcurrency = 1,
        headers: extraHeaders,
        onError,
        onRetry,
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
    if (!Number.isFinite(maxBatchBytes) || maxBatchBytes < 1) {
        throw new Error('createMCLogClient: `maxBatchBytes` debe ser >= 1');
    }
    if (!Number.isFinite(maxRetries) || maxRetries < 0) {
        throw new Error('createMCLogClient: `maxRetries` debe ser >= 0');
    }
    if (!Number.isFinite(retryBaseMs) || retryBaseMs < 0) {
        throw new Error('createMCLogClient: `retryBaseMs` debe ser >= 0');
    }
    if (!Number.isFinite(batchConcurrency) || batchConcurrency < 1) {
        throw new Error('createMCLogClient: `batchConcurrency` debe ser >= 1');
    }

    const doFetch = options.fetch ?? globalThis.fetch;
    if (typeof doFetch !== 'function') {
        throw new Error(
            'createMCLogClient: no hay `fetch` disponible. Usa Node >=18 o pasa la opción `fetch`.',
        );
    }

    const root = baseUrl.trim().replace(/\/+$/, '');
    const release = options.release ?? releaseFromEnv();

    const fail = (error: Error): boolean => {
        if (throwOnError) throw error;
        onError?.(error);
        return false;
    };

    /** Un intento suelto. `retryAfterMs` solo viene si el servidor lo indicó. */
    type Attempt =
        | { ok: true }
        | { ok: false; error: Error; retryable: boolean; retryAfterMs?: number | undefined };

    const attempt = async (path: string, body: string): Promise<Attempt> => {
        let response: Response;
        try {
            response = await doFetch(root + path, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'x-api-key': apiKey,
                    ...extraHeaders,
                },
                body,
                signal: AbortSignal.timeout(timeoutMs),
            });
        } catch (cause) {
            // Fallo de red o timeout: casi siempre transitorio.
            return {
                ok: false,
                error: new Error(`MCLog: fallo enviando log a ${root}${path}`, { cause }),
                retryable: true,
            };
        }

        if (response.ok) return { ok: true };

        const text = await response.text().catch(() => '');
        return {
            ok: false,
            error: new Error(`MCLog HTTP ${response.status}: ${text}`),
            retryable: isRetryableStatus(response.status),
            retryAfterMs: parseRetryAfter(response.headers.get('retry-after')),
        };
    };

    /**
     * Envía reintentando los fallos recuperables. Sin esto, un 429 del limitador
     * de ingesta —que es justo lo que devuelve el servicio cuando más logs se
     * están produciendo— descartaba la entrada en silencio.
     */
    const post = async (path: string, body: string): Promise<boolean> => {
        let last: Extract<Attempt, { ok: false }> | undefined;

        for (let tries = 0; tries <= maxRetries; tries += 1) {
            const result = await attempt(path, body);
            if (result.ok) return true;

            last = result;
            if (!result.retryable || tries === maxRetries) break;

            // El jitter evita que muchas instancias que fallaron a la vez
            // vuelvan a la vez y repitan la avalancha que las tumbó.
            const backoff = retryBaseMs * 2 ** tries * (0.5 + Math.random());
            const delayMs = Math.round(result.retryAfterMs ?? backoff);

            onRetry?.({ attempt: tries + 1, delayMs, error: result.error });
            await sleep(delayMs);
        }

        return fail(last!.error);
    };

    const withDefaults = (entry: MCLogInput): MCLogEntry => {
        // Prioridad: lo del log, luego lo del cliente y por ultimo el contexto,
        // salvo en la metadata, que se mezcla (cliente < contexto < log).
        const context = getContext();
        const metadata =
            options.defaultMetadata || context?.metadata || entry.metadata
                ? { ...options.defaultMetadata, ...context?.metadata, ...entry.metadata }
                : undefined;

        // La excepción completa los campos de error; lo escrito a mano manda.
        const fromError = entry.error !== undefined ? extractError(entry.error) : {};

        const merged: MCLogEntry = {
            application: entry.application ?? options.application ?? 'unknown-app',
            environment: entry.environment ?? options.environment ?? 'development',
            level: entry.level ?? 'info',
            message: entry.message ?? fromError.message ?? '',
        };

        const service = entry.service ?? options.service ?? context?.service;
        const host = entry.host ?? options.host;
        const traceId = entry.traceId ?? context?.traceId;
        const spanId = entry.spanId ?? context?.spanId;
        // El padre del contexto es el del tramo en curso: solo vale si el log
        // va en ese tramo, no en uno que el emisor haya puesto a mano.
        const parentSpanId = entry.parentSpanId ?? (entry.spanId === undefined ? context?.parentSpanId : undefined);
        const entryRelease = entry.release ?? release;
        const errorName = entry.errorName ?? fromError.errorName;
        const errorCode = entry.errorCode ?? fromError.errorCode;
        const errorStack = entry.errorStack ?? fromError.errorStack;

        if (service !== undefined) merged.service = service;
        if (host !== undefined) merged.host = host;
        if (entry.timestamp !== undefined) merged.timestamp = entry.timestamp;
        if (traceId !== undefined) merged.traceId = traceId;
        if (spanId !== undefined) merged.spanId = spanId;
        if (parentSpanId !== undefined) merged.parentSpanId = parentSpanId;
        if (entry.durationMs !== undefined) merged.durationMs = entry.durationMs;
        if (entryRelease !== undefined) merged.release = entryRelease;
        if (metadata !== undefined) merged.metadata = metadata;
        if (errorName !== undefined) merged.errorName = errorName;
        if (errorCode !== undefined) merged.errorCode = errorCode;
        if (errorStack !== undefined) merged.errorStack = errorStack;
        if (entry.fingerprint !== undefined) merged.fingerprint = entry.fingerprint;

        return merged;
    };

    const send = (entry: MCLogInput) => post('/api/log', JSON.stringify(withDefaults(entry)));

    const captureException = (error: unknown, captureOptions: MCLogCaptureOptions = {}) => {
        const extracted = extractError(error);
        const { message, ...rest } = captureOptions;
        return send({
            ...rest,
            level: captureOptions.level ?? 'error',
            message: message ?? extracted.message ?? 'Unhandled exception',
            error,
        });
    };

    /**
     * Trocea el lote por entradas y por bytes y lo envía. Por defecto en serie:
     * mandar todos los trozos a la vez convertía un lote grande en una ráfaga
     * simultánea contra el limitador de ingesta, que respondía 429 a casi
     * todos. `batchConcurrency` lo sube para quien tenga margen de cuota.
     */
    const sendBatch = async (entries: MCLogInput[]): Promise<boolean> => {
        if (!Array.isArray(entries) || entries.length === 0) return true;

        const bodies = packBatches(
            entries.map((entry) => JSON.stringify(withDefaults(entry))),
            maxBatchSize,
            maxBatchBytes,
        );
        let allOk = true;

        for (const group of chunk(bodies, batchConcurrency)) {
            const results = await Promise.all(group.map((body) => post('/api/logs/batch', body)));
            // No se corta al primer fallo: los trozos son independientes y
            // descartar el resto perdería logs que sí habrían entrado.
            if (!results.every(Boolean)) allOk = false;
        }

        return allOk;
    };

    const level =
        (lvl: MCLogLevel) => (message: string, metadata?: Record<string, unknown>) =>
            send({ level: lvl, message, metadata });

    const child = (overrides: MCLogChildOptions): MCLogClient => {
        const { metadata, ...fields } = overrides;
        return createMCLogClient({
            ...options,
            ...definedOnly(fields),
            defaultMetadata:
                options.defaultMetadata || metadata ? { ...options.defaultMetadata, ...metadata } : undefined,
        });
    };

    const startSpan = (name: string, spanOptions: MCLogSpanOptions = {}): MCLogSpan => {
        const parent = getContext();
        const traceId = parent?.traceId ?? newTraceId();
        const spanId = newSpanId();
        const parentSpanId = parent?.spanId;
        const startedAt = performance.now();
        let ended = false;

        return {
            traceId,
            spanId,
            run: (fn) =>
                withContext({ traceId, spanId, parentSpanId, service: spanOptions.service, metadata: spanOptions.metadata }, fn),
            end: (endOptions = {}) => {
                if (ended) return Promise.resolve(false);
                ended = true;
                const { message, level: endLevel, metadata, service, ...rest } = endOptions;
                return send({
                    ...rest,
                    message: message ?? name,
                    level: endLevel ?? (rest.error !== undefined ? 'error' : 'info'),
                    service: service ?? spanOptions.service,
                    metadata: spanOptions.metadata || metadata ? { ...spanOptions.metadata, ...metadata } : undefined,
                    traceId,
                    spanId,
                    parentSpanId,
                    durationMs: Math.max(0, Math.round(performance.now() - startedAt)),
                });
            },
        };
    };

    return {
        send,
        sendBatch,
        captureException,
        debug: level('debug'),
        info: level('info'),
        warn: level('warn'),
        error: level('error'),
        child,
        startSpan,
    };
};
