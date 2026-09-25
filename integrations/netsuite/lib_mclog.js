/**
 * @NApiVersion 2.1
 * @NModuleScope SameAccount
 *
 * lib_mclog.js — Librería central de MCLog para SuiteScript 2.1
 * =============================================================
 *
 * Envía los logs y los errores de tus scripts de servidor a MCLog con una sola
 * petición HTTPS por ejecución.
 *
 *   - Configuración fuera del código: la URL, la API key, la aplicación y el
 *     ambiente se leen de un registro personalizado y se guardan 5 minutos en
 *     N/cache. Cambiar la clave o apagar MCLog no obliga a tocar ningún script.
 *   - Envío en lote: los logs se acumulan en memoria y salen al terminar el
 *     punto de entrada. Cuesta 10 unidades de governance por ejecución, no por log.
 *   - Contexto automático: script, deployment, usuario, rol, governance
 *     restante y, en un User Event, el registro que se está guardando.
 *   - Errores agrupables: un SuiteScriptError se reparte en errorName y
 *     errorStack, y MCLog agrupa las repeticiones del mismo fallo en una fila.
 *   - Red de seguridad: una excepción no controlada se registra sola y se
 *     relanza, para que NetSuite siga marcando el fallo.
 *
 * Garantía: un fallo de MCLog NUNCA rompe tu script. Si falta la configuración,
 * el servicio no responde o no queda governance, se anota en el Execution Log
 * (N/log) y el script sigue.
 *
 * Solo para scripts de servidor: User Event, Scheduled, Map/Reduce, Suitelet,
 * RESTlet, Workflow Action y Mass Update. En un Client Script la API key
 * quedaría expuesta en el navegador.
 *
 * -----------------------------------------------------------------------------
 * PUESTA EN MARCHA
 *
 *   1. Crea en MCLog una API key con el permiso "Enviar logs" (ingest).
 *   2. Crea el registro personalizado de SETTINGS_RECORD (sección 1) y un
 *      registro con tu URL, tu clave, la aplicación y el ambiente.
 *   3. Sube este fichero al File Cabinet, p. ej. /SuiteScripts/lib/lib_mclog.js.
 *   4. Envuelve los puntos de entrada de tus scripts:
 *
 *      define(['/SuiteScripts/lib/lib_mclog'], (mcLog) => {
 *          const afterSubmit = (context) => {
 *              mcLog.info('Pedido sincronizado', { externalId: 'PO-1001' });
 *              try {
 *                  // ... tu lógica ...
 *              } catch (e) {
 *                  mcLog.exception('Error sincronizando el pedido', e, { externalId: 'PO-1001' });
 *                  throw e; // opcional: relánzalo si NetSuite debe marcar el fallo
 *              }
 *          };
 *          return mcLog.wrapEntryPoints({ afterSubmit });
 *      });
 *
 * Guía completa: https://ingheriespinosa.github.io/MCLogs/docs/integrar-netsuite-lib-mclog/
 * -----------------------------------------------------------------------------
 *
 * @author Ing. Heri Espinosa
 * @license MIT
 */
define(['N/https', 'N/log', 'N/runtime', 'N/query', 'N/cache'], (https, log, runtime, query, cache) => {

    // =========================================================================
    // 1. CONFIGURACIÓN — lo único que deberías adaptar a tu cuenta
    // =========================================================================

    /**
     * Registro personalizado con la conexión a MCLog. Se usa el primer registro
     * activo (por id) que tenga URL y API key. Para apagar MCLog, inactívalo.
     *
     * Si tu proyecto ya tiene un registro de configuración propio, añádele
     * estos cuatro campos y pon aquí sus ids: no hace falta un registro nuevo.
     */
    const SETTINGS_RECORD = {
        type: 'customrecord_mclog_config',
        fields: {
            /** URL base de la API de MCLog, p. ej. https://api-mclog.tu-dominio.com */
            url: 'custrecord_mclog_url',
            /** API key con el permiso "Enviar logs" (ingest). */
            apiKey: 'custrecord_mclog_api_key',
            /** Nombre de la aplicación en MCLog. Si está vacío, DEFAULT_APPLICATION. */
            application: 'custrecord_mclog_application',
            /** production | staging | development. Si está vacío, se deduce del tipo de cuenta. */
            environment: 'custrecord_mclog_environment'
        }
    };

    /** Aplicación que se usa si el campo del registro está vacío. */
    const DEFAULT_APPLICATION = 'NetSuite';

    /** Los logs debug no salen de una cuenta de producción: son para depurar en sandbox. */
    const SKIP_DEBUG_IN_PRODUCTION = true;

    /**
     * La configuración se guarda en N/cache, que no admite menos de 300 s: un
     * cambio en el registro tarda hasta 5 minutos en aplicarse.
     */
    const SETTINGS_CACHE = { name: 'mclog_settings', key: 'settings', ttlSeconds: 300 };

    /** Si la lectura falla (permisos, campos sin crear), se reintenta al cabo de un minuto. */
    const SETTINGS_RETRY_MS = 60 * 1000;

    // =========================================================================
    // 2. LÍMITES — tócalos solo si cambian los del servidor MCLog
    // =========================================================================

    const ENDPOINT_BATCH = '/api/logs/batch';

    /** MAX_BATCH_SIZE del servidor: un lote más grande se rechaza entero (400). */
    const MAX_BATCH_SIZE = 500;
    /** Margen bajo el BODY_LIMIT del servidor (3 MB): un cuerpo mayor se rechaza entero (413). */
    const MAX_BATCH_BYTES = 1024 * 1024;
    const BATCH_PREFIX = '{"logs":[';
    const BATCH_SUFFIX = ']}';

    /** Topes que valida el servidor: un solo campo que se pase tumba el lote entero. */
    const MAX_APPLICATION_LENGTH = 120;
    const MAX_SERVICE_LENGTH = 120;
    const MAX_TRACE_ID_LENGTH = 128;

    /** El servidor recorta estos campos por su cuenta; recortarlos aquí aligera el lote. */
    const MAX_ERROR_NAME_LENGTH = 200;
    const MAX_ERROR_CODE_LENGTH = 100;
    const MAX_MESSAGE_LENGTH = 20000;
    const MAX_STACK_LENGTH = 20000;

    /** Topes de la metadata, para que un volcado de XML o JSON no infle el lote. */
    const MAX_METADATA_STRING = 30000;
    const MAX_METADATA_DEPTH = 5;
    const MAX_METADATA_ARRAY = 50;
    const MAX_METADATA_KEYS = 100;

    // =========================================================================
    // 3. GOVERNANCE, MEMORIA Y DATOS SENSIBLES
    // =========================================================================

    /** Cada https.post cuesta 10 unidades de governance. */
    const HTTPS_POST_UNITS = 10;
    /**
     * Con tantas entradas en memoria se envían sin esperar al final del punto
     * de entrada (un Scheduled que recorre miles de documentos), siempre que
     * quede governance de sobra para el propio proceso.
     */
    const AUTO_FLUSH_SIZE = 200;
    const AUTO_FLUSH_MIN_USAGE = 200;
    /** Tope de entradas en memoria; las que pasen se descartan y se avisa de cuántas. */
    const MAX_BUFFER = 1000;
    /** Excepciones recientes que se recuerdan para no registrar dos veces la misma. */
    const MAX_TRACKED_ERRORS = 50;
    /** Errores de ejemplo que se adjuntan por etapa al resumen de un Map/Reduce. */
    const MAX_ERROR_SAMPLES = 10;

    /**
     * Claves de metadata cuyo valor se sustituye por REDACTED antes de enviar.
     * Solo se miran las claves: un secreto dentro del texto del mensaje sí viaja.
     */
    const SENSITIVE_KEY = /pass|contrase|token|secret|api[-_]?key|authorization|credential|cookie|private[-_]?key/i;
    const REDACTED = '[REDACTED]';
    const ELLIPSIS = '…';

    // =========================================================================
    // 4. ESTADO DE LA INVOCACIÓN
    // =========================================================================

    const newExecutionId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

    /**
     * Datos comunes a todos los logs de una invocación: su id, el documento
     * que se está procesando (traceId) y la metadata fijada con setContext.
     */
    const newScope = (metadata) => ({ executionId: newExecutionId(), document: null, metadata: metadata || {} });

    /** Logs pendientes de enviar, cuántos se descartaron por el tope y excepciones ya registradas. */
    let buffer = [];
    let dropped = 0;
    let loggedErrors = [];
    let scope = newScope();

    /** Configuración resuelta: { value, expiresAt }. Sobrevive entre invocaciones del mismo módulo. */
    let settingsMemo = null;

    // =========================================================================
    // 5. UTILIDADES
    // =========================================================================

    /** Recorta a `max` caracteres con una elipsis, sin partir un emoji por la mitad. */
    const truncate = (text, max) => {
        const value = String(text);
        if (value.length <= max) return value;
        let end = max - ELLIPSIS.length;
        const last = value.charCodeAt(end - 1);
        if (last >= 0xd800 && last <= 0xdbff) end -= 1;
        return value.slice(0, end) + ELLIPSIS;
    };

    const remainingUsage = () => {
        try {
            return runtime.getCurrentScript().getRemainingUsage();
        } catch (e) {
            return Number.MAX_SAFE_INTEGER;
        }
    };

    /** Error de JS, SuiteScriptError o un objeto con la misma forma. */
    const isErrorLike = (value) =>
        value instanceof Error ||
        (!!value && typeof value === 'object' && typeof value.message === 'string' &&
            (typeof value.name === 'string' || value.stack !== undefined));

    /**
     * Copia un valor dejándolo apto para enviar: sin credenciales, sin ciclos
     * (se corta en MAX_METADATA_DEPTH) y con textos y colecciones acotados.
     */
    const sanitize = (value, depth) => {
        if (value === null || value === undefined) return value;
        switch (typeof value) {
            case 'string': return truncate(value, MAX_METADATA_STRING);
            case 'number':
            case 'boolean': return value;
            case 'function': return '[Function]';
            case 'object': break;
            default: return String(value); // bigint, symbol
        }
        if (depth >= MAX_METADATA_DEPTH) return '[...]';
        if (value instanceof Date) return isNaN(value.getTime()) ? 'Invalid Date' : value.toISOString();
        if (isErrorLike(value)) return { name: value.name, message: value.message };
        if (Array.isArray(value)) return value.slice(0, MAX_METADATA_ARRAY).map((item) => sanitize(item, depth + 1));
        // Objetos con su propia serialización, como un N/record: se usa la misma que JSON.stringify.
        if (typeof value.toJSON === 'function') {
            try {
                return sanitize(value.toJSON(), depth + 1);
            } catch (e) {
                return '[No serializable]';
            }
        }

        const keys = Object.keys(value);
        const out = {};
        keys.slice(0, MAX_METADATA_KEYS).forEach((key) => {
            out[key] = SENSITIVE_KEY.test(key) ? REDACTED : sanitize(value[key], depth + 1);
        });
        if (keys.length > MAX_METADATA_KEYS) out.mclogOmittedKeys = keys.length - MAX_METADATA_KEYS;
        return out;
    };

    /** La metadata debe ser un objeto: cualquier otro valor se guarda como `details`. */
    const asMetadata = (value) => {
        if (value === null || value === undefined) return {};
        const isPlainObject = typeof value === 'object' && !Array.isArray(value) && !(value instanceof Date) && !isErrorLike(value);
        return isPlainObject ? sanitize(value, 0) : { details: sanitize(value, 1) };
    };

    /** Contexto estándar de NetSuite que acompaña a cada log. */
    const nsContext = () => {
        try {
            const script = runtime.getCurrentScript();
            const user = runtime.getCurrentUser();
            return {
                scriptId: script.id,
                deploymentId: script.deploymentId,
                executionContext: runtime.executionContext,
                accountId: runtime.accountId,
                envType: runtime.envType,
                userId: user.id,
                userRole: String(user.role),
                remainingUsage: script.getRemainingUsage()
            };
        } catch (e) {
            return {};
        }
    };

    /**
     * Reparte una excepción en los campos que MCLog usa para agrupar errores.
     *
     * En un SuiteScriptError el código estable va en `name` (p. ej.
     * 'INVALID_FLD_VALUE') y el `stack` llega como array de marcos. Su `id`
     * cambia en cada ejecución, así que no sirve como código: buildEntry lo
     * guarda en metadata.netsuiteErrorId para cruzarlo con el Execution Log.
     *
     * @param {Error|Object|string} e Excepción capturada
     * @returns {{errorName?: string, errorCode?: string, errorStack?: string}}
     */
    const errorFields = (e) => {
        if (!e || typeof e !== 'object') return {};
        const fields = {};
        if (e.name) fields.errorName = truncate(e.name, MAX_ERROR_NAME_LENGTH);
        if (typeof e.code === 'string' || typeof e.code === 'number') fields.errorCode = truncate(e.code, MAX_ERROR_CODE_LENGTH);
        if (e.stack) fields.errorStack = truncate(Array.isArray(e.stack) ? e.stack.join('\n') : e.stack, MAX_STACK_LENGTH);
        return fields;
    };

    /** Texto legible de lo que se haya capturado en un catch. */
    const errorMessage = (e) => {
        if (e === null || e === undefined) return '';
        if (typeof e === 'string') return e;
        if (typeof e.message === 'string' && e.message) return e.message;
        try {
            return JSON.stringify(e);
        } catch (ignore) {
            return String(e);
        }
    };

    // =========================================================================
    // 6. CONFIGURACIÓN DESDE EL REGISTRO
    // =========================================================================

    /** Nombres que acepta el campo de ambiente, además de los tres que exige MCLog. */
    const ENVIRONMENT_ALIASES = {
        production: ['production', 'produccion', 'producción', 'prod', 'prd'],
        staging: ['staging', 'stage', 'sandbox', 'sb', 'test', 'testing', 'qa', 'uat', 'pruebas', 'prueba'],
        development: ['development', 'desarrollo', 'dev', 'local']
    };

    /** Ambiente que se deduce del tipo de cuenta (runtime.envType) si el campo está vacío. */
    const ACCOUNT_ENVIRONMENT = { PRODUCTION: 'production', SANDBOX: 'staging', BETA: 'staging' };

    const normalizeEnvironment = (value) => {
        const env = String(value || '').trim().toLowerCase();
        const match = Object.keys(ENVIRONMENT_ALIASES).find((name) => ENVIRONMENT_ALIASES[name].indexOf(env) !== -1);
        return match || ACCOUNT_ENVIRONMENT[String(runtime.envType)] || 'development';
    };

    /** Deja la URL base sin barra final ni la ruta del endpoint, por si la pegaron completa. */
    const normalizeBaseUrl = (value) =>
        String(value || '').trim().replace(/\/+$/, '').replace(/\/api\/logs?(\/batch)?$/i, '');

    /**
     * Lee la configuración del registro. Solo corre cuando la caché está vacía
     * o caducada, así que sus avisos salen como mucho una vez cada 5 minutos.
     */
    const loadSettingsFromRecord = () => {
        const f = SETTINGS_RECORD.fields;
        const rows = query.runSuiteQL({
            query: `SELECT id,
                           ${f.url} AS url,
                           ${f.apiKey} AS apikey,
                           ${f.application} AS application,
                           ${f.environment} AS environment
                    FROM ${SETTINGS_RECORD.type}
                    WHERE isinactive = ?
                    ORDER BY id`,
            params: ['F']
        }).asMappedResults();

        const row = rows.find((r) => normalizeBaseUrl(r.url) && String(r.apikey || '').trim());
        if (!row) {
            log.audit({ title: 'MCLog desactivado', details: `No hay ningún ${SETTINGS_RECORD.type} activo con URL y API key.` });
            return { enabled: false };
        }

        const url = normalizeBaseUrl(row.url);
        // La API key viaja en una cabecera: por HTTP plano iría a la vista de cualquiera.
        if (!/^https:\/\/[^\s/]+/i.test(url)) {
            log.error({ title: 'MCLog desactivado', details: `La URL de ${SETTINGS_RECORD.type} ${row.id} debe empezar por https://` });
            return { enabled: false };
        }

        return {
            enabled: true,
            settingsId: row.id,
            url: url,
            apiKey: String(row.apikey).trim(),
            application: truncate(String(row.application || '').trim() || DEFAULT_APPLICATION, MAX_APPLICATION_LENGTH),
            environment: normalizeEnvironment(row.environment)
        };
    };

    /**
     * Configuración vigente, o null si MCLog está desactivado (sin registro,
     * sin URL o sin API key) o no se pudo leer.
     */
    const getSettings = () => {
        if (settingsMemo && Date.now() < settingsMemo.expiresAt) return settingsMemo.value;

        let value = null;
        let ttlMs = SETTINGS_CACHE.ttlSeconds * 1000;
        try {
            const raw = cache.getCache({ name: SETTINGS_CACHE.name, scope: cache.Scope.PRIVATE }).get({
                key: SETTINGS_CACHE.key,
                loader: () => JSON.stringify(loadSettingsFromRecord()),
                ttl: SETTINGS_CACHE.ttlSeconds
            });
            const parsed = JSON.parse(raw);
            value = parsed && parsed.enabled ? parsed : null;
        } catch (e) {
            // Sin permiso sobre el registro, campos aún no creados, etc. En un
            // Map/Reduce el módulo sigue vivo para otras claves: se reintenta
            // en un minuto en vez de insistir en cada una.
            log.error({ title: 'MCLog: no se pudo leer la configuración', details: `${SETTINGS_RECORD.type}: ${e.name || ''} ${e.message || e}` });
            ttlMs = SETTINGS_RETRY_MS;
        }

        settingsMemo = { value: value, expiresAt: Date.now() + ttlMs };
        return value;
    };

    // =========================================================================
    // 7. CONSTRUCCIÓN Y ACUMULACIÓN DE LOGS
    // =========================================================================

    const wasLogged = (err) => loggedErrors.indexOf(err) !== -1;

    const rememberError = (err) => {
        loggedErrors.push(err);
        if (loggedErrors.length > MAX_TRACKED_ERRORS) loggedErrors.shift();
    };

    /**
     * Construye una entrada con todo menos application y environment, que se
     * completan al enviar: la configuración solo se lee si hay algo que enviar.
     */
    const buildEntry = (level, message, metadata, error) => {
        const ctx = nsContext();
        const meta = Object.assign({}, ctx, scope.metadata, scope.document, asMetadata(metadata));
        meta.executionId = scope.executionId;

        const traceId = scope.document
            ? `${scope.document.recordType}:${scope.document.recordId}`
            : `exec-${scope.executionId}`;

        let text = message === null || message === undefined ? '' : String(message);
        const entry = {
            level: level,
            timestamp: new Date().toISOString(),
            service: truncate(ctx.scriptId || 'netsuite', MAX_SERVICE_LENGTH),
            host: 'netsuite-' + (ctx.accountId || 'unknown'),
            traceId: truncate(traceId, MAX_TRACE_ID_LENGTH)
        };

        if (error !== undefined && error !== null) {
            Object.assign(entry, errorFields(error));
            const detail = errorMessage(error);
            text = text && detail ? `${text}: ${detail}` : text || detail;
            if (typeof error === 'object') {
                if (error.id) meta.netsuiteErrorId = String(error.id);
                rememberError(error);
            }
        }

        entry.message = truncate(text || 'Log sin mensaje', MAX_MESSAGE_LENGTH);
        entry.metadata = meta;
        return entry;
    };

    const enqueue = (level, message, metadata, error) => {
        try {
            // Una excepción que se registra y se relanza no se repite en cada
            // catch por el que pasa: vale el primer registro, el más cercano al
            // origen. Sin esto, MCLog contaría N ocurrencias de un solo fallo.
            if (error && typeof error === 'object' && wasLogged(error)) return;
            if (buffer.length >= MAX_BUFFER) {
                dropped++;
                return;
            }
            buffer.push(buildEntry(level, message, metadata, error));
            if (buffer.length >= AUTO_FLUSH_SIZE && remainingUsage() > AUTO_FLUSH_MIN_USAGE) flush();
        } catch (e) {
            log.error({ title: 'MCLog: no se pudo registrar el log', details: e.message || String(e) });
        }
    };

    // =========================================================================
    // 8. ENVÍO
    // =========================================================================

    /** Bytes que ocupa una cadena en UTF-8 (SuiteScript no garantiza TextEncoder). */
    const utf8Length = (text) => {
        let bytes = 0;
        for (let i = 0; i < text.length; i++) {
            const code = text.charCodeAt(i);
            if (code < 0x80) bytes += 1;
            else if (code < 0x800) bytes += 2;
            else if (code >= 0xd800 && code <= 0xdbff) {
                bytes += 4;
                i++;
            } else bytes += 3;
        }
        return bytes;
    };

    /**
     * Agrupa entradas ya serializadas en cuerpos que respetan MAX_BATCH_SIZE y
     * MAX_BATCH_BYTES. Una entrada que por sí sola pase del tope va en un
     * cuerpo propio: si el servidor la rechaza, no arrastra a las demás.
     */
    const packBatches = (serialized) => {
        const bodies = [];
        const emptyBytes = BATCH_PREFIX.length + BATCH_SUFFIX.length;
        let current = [];
        let currentBytes = emptyBytes;

        serialized.forEach((entry) => {
            const bytes = utf8Length(entry);
            if (current.length > 0 && (current.length >= MAX_BATCH_SIZE || currentBytes + 1 + bytes > MAX_BATCH_BYTES)) {
                bodies.push(BATCH_PREFIX + current.join(',') + BATCH_SUFFIX);
                current = [];
                currentBytes = emptyBytes;
            }
            currentBytes += (current.length > 0 ? 1 : 0) + bytes;
            current.push(entry);
        });
        if (current.length > 0) bodies.push(BATCH_PREFIX + current.join(',') + BATCH_SUFFIX);

        return bodies;
    };

    /** Pista para el Execution Log según el código HTTP que devuelva MCLog. */
    const HTTP_HINTS = {
        400: 'algún campo no es válido',
        401: 'API key incorrecta, revocada o caducada',
        403: 'la API key no tiene el permiso "Enviar logs" o no admite esta aplicación',
        413: 'el lote supera el BODY_LIMIT del servidor',
        429: 'límite de ingesta superado; no se reintenta para no gastar governance'
    };

    /** Sin reintentos: reintentar cuesta más governance de lo que vale el log perdido. */
    const post = (settings, body) => {
        try {
            const response = https.post({
                url: settings.url + ENDPOINT_BATCH,
                body: body,
                headers: {
                    'Content-Type': 'application/json',
                    'x-api-key': settings.apiKey
                }
            });
            if (response.code >= 200 && response.code < 300) return true;

            const hint = HTTP_HINTS[response.code];
            log.error({
                title: 'MCLog: respuesta no exitosa',
                details: `HTTP ${response.code}${hint ? ` (${hint})` : ''}: ${truncate(response.body || '', 1000)}`
            });
            return false;
        } catch (e) {
            log.error({ title: 'MCLog: error de red', details: `${e.name || ''} ${e.message || e}`.trim() });
            return false;
        }
    };

    /**
     * Envía lo acumulado. wrapEntryPoints lo llama al terminar cada punto de
     * entrada; a mano solo hace falta en scripts sin envoltorio.
     *
     * @returns {boolean} true si no quedó nada pendiente de enviar
     */
    const flush = () => {
        try {
            if (dropped > 0) {
                const count = dropped;
                dropped = 0;
                buffer.push(buildEntry('warn', `MCLog: se descartaron ${count} logs por superar el tope de ${MAX_BUFFER} en memoria`));
            }
            if (!buffer.length) return true;

            const entries = buffer;
            buffer = [];

            // Leer la configuración (si caducó la caché) y enviar cuestan 10 + 10 unidades.
            if (remainingUsage() < HTTPS_POST_UNITS * 2) {
                log.audit({ title: 'MCLog: sin governance para enviar', details: `Se descartaron ${entries.length} logs.` });
                return false;
            }

            const settings = getSettings();
            if (!settings) return false;

            const skipDebug = SKIP_DEBUG_IN_PRODUCTION && settings.environment === 'production';
            const serialized = entries
                .filter((entry) => !(skipDebug && entry.level === 'debug'))
                .map((entry) => JSON.stringify(Object.assign({ application: settings.application, environment: settings.environment }, entry)));
            if (!serialized.length) return true;

            let allSent = true;
            let skipped = 0;
            packBatches(serialized).forEach((body) => {
                // Sin governance para el post, el lote se descarta en vez de romper el script.
                if (remainingUsage() < HTTPS_POST_UNITS) {
                    skipped++;
                    allSent = false;
                    return;
                }
                if (!post(settings, body)) allSent = false;
            });
            if (skipped) log.audit({ title: 'MCLog: sin governance para enviar', details: `Se descartaron ${skipped} lote(s) de logs.` });

            return allSent;
        } catch (e) {
            log.error({ title: 'MCLog: error enviando los logs', details: e.message || String(e) });
            return false;
        }
    };

    // =========================================================================
    // 9. API DE LOGS
    // =========================================================================

    /**
     * Registra un log. Todos los niveles aceptan un error opcional como tercer
     * argumento, para guardar su clase y su stack en un fallo que no merece
     * nivel error (p. ej. una validación que bloquea el guardado).
     *
     * @param {string} message    Qué pasó, en una frase
     * @param {Object} [metadata] Datos para investigar: ids, importes, estados
     * @param {Error|Object} [error] Excepción relacionada
     */
    const debug = (message, metadata, error) => enqueue('debug', message, metadata, error);
    /** @see debug */
    const info = (message, metadata, error) => enqueue('info', message, metadata, error);
    /** @see debug */
    const warn = (message, metadata, error) => enqueue('warn', message, metadata, error);
    /** @see debug */
    const error = (message, metadata, err) => enqueue('error', message, metadata, err);

    /**
     * Registra una excepción capturada, con nivel error, su clase y su stack,
     * para que MCLog agrupe sus repeticiones en un solo error. El mensaje de la
     * excepción se añade al texto: "<message>: <error.message>".
     *
     * @param {string} message    Qué se estaba intentando hacer
     * @param {Error|Object|string} err Lo capturado en el catch
     * @param {Object} [metadata] Datos para investigar
     *
     * @example
     *   try { ... } catch (e) { mcLog.exception('Error enviando la factura', e, { invoiceId }); }
     */
    const exception = (message, err, metadata) => enqueue('error', message, metadata, err);

    /**
     * Asocia los logs siguientes a un documento: traceId "<tipo>:<id>" (p. ej.
     * "invoice:1234"). Es el mismo en todos los scripts, así que en MCLog ves
     * la historia completa del documento. En un User Event lo hace el
     * envoltorio solo. Sin tipo o sin id no cambia nada.
     *
     * @param {string} recordType Tipo de registro, p. ej. 'invoice'
     * @param {string|number} recordId Id interno
     */
    const setDocument = (recordType, recordId) => {
        if (!recordType || !recordId) return;
        scope.document = { recordType: String(recordType), recordId: String(recordId) };
    };

    /** Vuelve al traceId de la ejecución, al terminar un documento dentro de un bucle. */
    const clearDocument = () => {
        scope.document = null;
    };

    /**
     * Ejecuta `fn` con los logs asociados a un documento y después, pase lo que
     * pase, vuelve al documento anterior. Es la forma segura de hacerlo dentro
     * de un bucle. `fn` debe ser síncrona.
     *
     * @param {string} recordType
     * @param {string|number} recordId
     * @param {Function} fn
     * @returns {*} Lo que devuelva `fn`
     *
     * @example
     *   invoiceIds.forEach((id) => mcLog.withDocument('invoice', id, () => sendInvoice(id)));
     */
    const withDocument = (recordType, recordId, fn) => {
        const previous = scope.document;
        setDocument(recordType, recordId);
        try {
            return fn();
        } finally {
            scope.document = previous;
        }
    };

    /**
     * Añade metadata a todos los logs siguientes de esta invocación.
     *
     * @example mcLog.setContext({ subsidiary: 3, batchId: 'LOTE-17' });
     */
    const setContext = (metadata) => {
        Object.assign(scope.metadata, asMetadata(metadata));
    };

    // =========================================================================
    // 10. ENVOLTORIO DE PUNTOS DE ENTRADA
    // =========================================================================

    /** Reinicia el estado y extrae del contexto lo que ayuda a investigar. */
    const beginInvocation = (entryPoint, context) => {
        buffer = [];
        dropped = 0;
        loggedErrors = [];
        scope = newScope({ entryPoint: entryPoint });

        try {
            if (!context || typeof context !== 'object') return;
            const rec = context.newRecord || context.oldRecord;
            if (rec && rec.type) {
                // User Event y Workflow Action
                scope.metadata.recordType = String(rec.type);
                if (context.type) scope.metadata.eventType = String(context.type);
                setDocument(rec.type, rec.id);
            } else if (entryPoint === 'map' || entryPoint === 'reduce') {
                scope.metadata.key = String(context.key);
            } else if (entryPoint === 'onRequest' && context.request) {
                scope.metadata.method = String(context.request.method);
            } else if (entryPoint === 'execute' && context.type) {
                scope.metadata.invocationType = String(context.type);
            } else if (entryPoint === 'each') {
                // Mass Update
                setDocument(context.type, context.id);
            }
        } catch (e) {
            // El contexto es opcional: nunca debe impedir que corra el script.
        }
    };

    const countErrors = (stageSummary) => {
        let count = 0;
        const samples = [];
        if (!stageSummary || !stageSummary.errors) return { count: count, samples: samples };
        stageSummary.errors.iterator().each((key, err) => {
            count++;
            if (samples.length < MAX_ERROR_SAMPLES) samples.push({ key: key, error: truncate(err, 1000) });
            return true;
        });
        return { count: count, samples: samples };
    };

    /**
     * Resumen automático al terminar un Map/Reduce. Los errores de cada clave
     * ya se registraron en su map o reduce; aquí solo se cuentan, con una
     * muestra de los que no alcanzaron a enviarse (sin governance, timeout).
     */
    const logMapReduceSummary = (summary) => {
        try {
            const inputError = summary.inputSummary && summary.inputSummary.error;
            const mapErrors = countErrors(summary.mapSummary);
            const reduceErrors = countErrors(summary.reduceSummary);
            const failed = !!inputError || mapErrors.count > 0 || reduceErrors.count > 0;

            enqueue(failed ? 'warn' : 'info', failed ? 'Map/Reduce finalizado con errores' : 'Map/Reduce finalizado', {
                usage: summary.usage,
                concurrency: summary.concurrency,
                yields: summary.yields,
                seconds: summary.seconds,
                inputError: inputError ? truncate(inputError, 2000) : undefined,
                mapErrors: mapErrors.count,
                reduceErrors: reduceErrors.count,
                errorSamples: mapErrors.samples.concat(reduceErrors.samples)
            });
        } catch (e) {
            log.error({ title: 'MCLog: no se pudo resumir el Map/Reduce', details: e.message || String(e) });
        }
    };

    const wrapEntryPoint = (entryPoint, fn) => function (context) {
        // Si esta invocación dispara otra que comparte el módulo (un guardado
        // que lanza un User Event), lo acumulado aquí se aparta y se repone.
        const saved = { buffer: buffer, dropped: dropped, loggedErrors: loggedErrors, scope: scope };
        const restore = () => {
            buffer = saved.buffer;
            dropped = saved.dropped;
            loggedErrors = saved.loggedErrors;
            scope = saved.scope;
        };
        // Red de seguridad: si la excepción ya se registró a mano, enqueue no la repite.
        const logUnhandled = (e) => exception(`Error no controlado en ${entryPoint}`, e);
        let isAsync = false;

        beginInvocation(entryPoint, context);
        try {
            const result = fn.apply(this, arguments);
            if (entryPoint === 'summarize') logMapReduceSummary(context);

            // Punto de entrada async: lo que corre tras el primer await llega
            // después de este return. Se envía cuando la promesa termina, con
            // el estado de esta invocación todavía activo.
            if (result && typeof result.then === 'function') {
                isAsync = true;
                return result.then(
                    (value) => {
                        flush();
                        restore();
                        return value;
                    },
                    (e) => {
                        logUnhandled(e);
                        flush();
                        restore();
                        throw e;
                    }
                );
            }
            return result;
        } catch (e) {
            logUnhandled(e);
            throw e;
        } finally {
            // Lo síncrono se envía ya: no depende de que la promesa llegue a resolverse.
            flush();
            if (!isAsync) restore();
        }
    };

    /**
     * Envuelve los puntos de entrada del script. En cada invocación:
     *   1. reinicia el estado y toma el contexto (registro, clave, método...);
     *   2. registra las excepciones no controladas, y las relanza;
     *   3. envía todo lo acumulado en un solo lote al terminar.
     * En un Map/Reduce añade además un resumen al final de summarize.
     *
     * @param {Object<string, Function>} entryPoints Los puntos de entrada del script
     * @returns {Object<string, Function>} Los mismos, envueltos
     *
     * @example return mcLog.wrapEntryPoints({ beforeSubmit, afterSubmit });
     */
    const wrapEntryPoints = (entryPoints) => {
        const wrapped = {};
        Object.keys(entryPoints).forEach((name) => {
            const fn = entryPoints[name];
            wrapped[name] = typeof fn === 'function' ? wrapEntryPoint(name, fn) : fn;
        });
        return wrapped;
    };

    return {
        debug: debug,
        info: info,
        warn: warn,
        error: error,
        exception: exception,
        setDocument: setDocument,
        clearDocument: clearDocument,
        withDocument: withDocument,
        setContext: setContext,
        flush: flush,
        wrapEntryPoints: wrapEntryPoints,
        errorFields: errorFields
    };
});
