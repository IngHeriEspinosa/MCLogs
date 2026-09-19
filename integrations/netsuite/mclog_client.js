/**
 * MCLog Client para NetSuite — módulo SuiteScript 2.1 reutilizable.
 *
 * Envía logs de cualquier script (User Event, Scheduled, Map/Reduce, Suitelet,
 * RESTlet, Client Script del lado servidor) al servicio centralizado MCLog
 * vía API REST con autenticación por API key.
 *
 * Instalación:
 *   1. Sube este archivo al File Cabinet (p. ej. /SuiteScripts/lib/mclog_client.js).
 *   2. Configura MCLOG_URL y MCLOG_API_KEY abajo (o cárgalos desde parámetros
 *      de script / registro de configuración según tu estándar).
 *   3. En tu script: define(['/SuiteScripts/lib/mclog_client'], function (mclog) { ... })
 *
 * Diseño: los errores de red NUNCA se propagan — un fallo del servicio de logs
 * no debe romper el script de negocio. Si falla, se registra con N/log y sigue.
 *
 * @NApiVersion 2.1
 * @NModuleScope Public
 */
define(['N/https', 'N/log', 'N/runtime'], (https, log, runtime) => {

    // ====== CONFIGURACIÓN ======
    const MCLOG_URL = 'https://TU-SERVIDOR-MCLOG.com'; // sin slash final
    const MCLOG_API_KEY = 'CAMBIA-ESTA-API-KEY';
    const DEFAULT_ENVIRONMENT = 'production'; // development | staging | production
    // ===========================

    const ENDPOINT_SINGLE = '/api/log';
    const ENDPOINT_BATCH = '/api/logs/batch';

    /**
     * Contexto estándar de NetSuite que se adjunta a cada log como metadata.
     */
    const nsContext = () => {
        try {
            const script = runtime.getCurrentScript();
            const user = runtime.getCurrentUser();
            return {
                scriptId: script.id,
                deploymentId: script.deploymentId,
                executionContext: runtime.executionContext,
                accountId: runtime.accountId,
                userId: user.id,
                userRole: String(user.role),
                remainingUsage: script.getRemainingUsage()
            };
        } catch (e) {
            return {};
        }
    };

    /**
     * Reparte una excepción de NetSuite en los campos que MCLog usa para
     * agrupar errores.
     *
     * En un SuiteScriptError el código estable va en `name` (p. ej.
     * 'INVALID_FLD_VALUE') y el `stack` llega como array de marcos. El `id`
     * NO se usa como código: es distinto en cada ejecución y convertiría cada
     * ocurrencia en un grupo propio, que es justo lo contrario de lo que se
     * busca. Se guarda en metadata, donde sirve para cruzar con el registro
     * de ejecución de NetSuite.
     *
     * @param {Error|Object} e Excepción capturada
     */
    const errorFields = (e) => {
        if (!e) return {};
        const fields = {};
        if (e.name) fields.errorName = String(e.name);
        if (e.stack) fields.errorStack = Array.isArray(e.stack) ? e.stack.join('\n') : String(e.stack);
        return fields;
    };

    /**
     * Construye el payload de un log con los campos que exige MCLog.
     * @param {string} level  debug | info | warn | error
     * @param {Object} opts
     * @param {string} opts.application  Nombre de la app/SuiteApp (obligatorio)
     * @param {string} opts.message     Mensaje del log (obligatorio)
     * @param {string} [opts.service]   Nombre del script/servicio (por defecto scriptId)
     * @param {string} [opts.environment] development | staging | production
     * @param {string} [opts.traceId]   Id de correlación entre scripts
     * @param {Object} [opts.metadata]  Datos adicionales (se mezclan con el contexto NS)
     * @param {Error}  [opts.error]     Excepción capturada; rellena errorName y errorStack
     */
    const buildPayload = (level, opts) => {
        const ctx = nsContext();
        const extra = opts.error ? errorFields(opts.error) : {};
        const metadata = Object.assign({}, ctx, opts.metadata || {});

        if (opts.error && opts.error.id) metadata.netsuiteErrorId = String(opts.error.id);

        return {
            application: opts.application,
            service: opts.service || ctx.scriptId,
            host: 'netsuite-' + (ctx.accountId || 'unknown'),
            level: level,
            environment: opts.environment || DEFAULT_ENVIRONMENT,
            message: opts.message || (opts.error && opts.error.message) || 'Excepción sin mensaje',
            traceId: opts.traceId,
            errorName: opts.errorName || extra.errorName,
            errorCode: opts.errorCode,
            errorStack: opts.errorStack || extra.errorStack,
            metadata: metadata
        };
    };

    const post = (endpoint, body) => {
        try {
            const response = https.post({
                url: MCLOG_URL + endpoint,
                body: JSON.stringify(body),
                headers: {
                    'Content-Type': 'application/json',
                    'x-api-key': MCLOG_API_KEY
                }
            });
            if (response.code >= 300) {
                log.error('MCLog: respuesta no exitosa', `HTTP ${response.code}: ${response.body}`);
                return false;
            }
            return true;
        } catch (e) {
            // Nunca romper el script de negocio por un fallo del servicio de logs
            log.error('MCLog: error de red', e.message);
            return false;
        }
    };

    /**
     * Envía un log individual.
     * @example mclog.send('error', { application: 'SuiteApp-Facturacion', message: 'Fallo al crear factura', metadata: { recordId: 123 } });
     */
    const send = (level, opts) => post(ENDPOINT_SINGLE, buildPayload(level, opts));

    /**
     * Envía varios logs en una sola petición (recomendado en Map/Reduce y Scheduled
     * para ahorrar governance: 1 llamada https en lugar de N).
     * @param {Array<{level: string} & Object>} entries  Cada entrada: { level, application, message, ... }
     */
    const sendBatch = (entries) => {
        if (!entries || !entries.length) return true;
        const logs = entries.map((e) => buildPayload(e.level || 'info', e));
        return post(ENDPOINT_BATCH, { logs });
    };

    /**
     * Crea un logger pre-configurado para no repetir application/environment en cada llamada.
     * @example
     *   const appLog = mclog.createLogger({ application: 'SuiteApp-Facturacion', environment: 'production' });
     *   appLog.info('Factura creada', { recordId: 123 });
     *   appLog.error('Fallo de sincronización', { recordId: 456, error: e.message });
     */
    const createLogger = (defaults) => {
        const wrap = (level) => (message, metadata, extra) =>
            send(level, Object.assign({}, defaults, extra || {}, { message: message, metadata: metadata }));
        return {
            debug: wrap('debug'),
            info: wrap('info'),
            warn: wrap('warn'),
            error: wrap('error'),
            /**
             * Registra una excepción con su clase y su stack, para que MCLog
             * agrupe sus repeticiones en un solo error en lugar de en N.
             *
             * @example
             *   try { ... } catch (e) { appLog.exception('Fallo al facturar', e, { recordId: id }); }
             */
            exception: (message, error, metadata, extra) =>
                send(
                    'error',
                    Object.assign({}, defaults, extra || {}, {
                        message: message,
                        error: error,
                        metadata: metadata
                    })
                ),
            batch: (entries) => sendBatch(entries.map((e) => Object.assign({}, defaults, e)))
        };
    };

    return { send: send, sendBatch: sendBatch, createLogger: createLogger, errorFields: errorFields };
});
