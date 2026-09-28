/**
 * @NApiVersion 2.1
 * @NModuleScope SameAccount
 *
 * lib_mclog_browser.js — Logs de MCLog desde Client Scripts
 * ==========================================================
 *
 * Un Client Script corre en el navegador del usuario: si llamara a MCLog
 * directamente, la API key quedaría a la vista de cualquiera con las
 * herramientas de desarrollo. Por eso esta librería no habla con MCLog, sino
 * con un Suitelet de tu cuenta (examples/sl_mclog_browser_proxy.js), que valida
 * lo que recibe y lo reenvía con lib_mclog.js desde el servidor.
 *
 *   Client Script ──► lib_mclog_browser ──► Suitelet proxy ──► lib_mclog ──► MCLog
 *                     (sin API key)         (con la sesión     (con la API key,
 *                                            del usuario)       en el servidor)
 *
 * Garantías:
 *   - Nunca rompe el formulario ni molesta al usuario: si el envío falla, se
 *     ignora en silencio.
 *   - No bloquea: el envío va en segundo plano (https.post.promise).
 *   - No inunda: el mismo error se envía una sola vez por página, y como mucho
 *     MAX_REPORTS_PER_PAGE envíos por carga de página.
 *
 * Uso:
 *
 *   define(['/SuiteScripts/lib/lib_mclog_browser'], (mcLogBrowser) => {
 *       const fieldChanged = (context) => {
 *           try {
 *               // ... tu lógica ...
 *           } catch (e) {
 *               mcLogBrowser.exception('No se pudo calcular el descuento', e, { fieldId: context.fieldId });
 *           }
 *       };
 *       return mcLogBrowser.wrapEntryPoints({ fieldChanged });
 *   });
 *
 * Guía paso a paso: https://ingheriespinosa.github.io/MCLogs/docs/netsuite-recetario/
 *
 * @author Ing. Heri Espinosa
 * @license MIT
 */
define(['N/https', 'N/url', 'N/runtime', 'N/currentRecord'], (https, url, runtime, currentRecord) => {

    // =========================================================================
    // CONFIGURACIÓN — debe coincidir con el Script y el Deployment del proxy
    // =========================================================================

    const PROXY = {
        scriptId: 'customscript_mcl_browser_proxy',
        deploymentId: 'customdeploy_mcl_browser_proxy'
    };

    /**
     * Cabecera que el proxy exige. Un formulario de otra web no puede añadir
     * cabeceras propias, así que no puede colar logs usando la sesión del usuario.
     */
    const CLIENT_HEADER = 'X-MCLog-Client';

    /** Envíos por carga de página: un bucle con un error no debe generar cien peticiones. */
    const MAX_REPORTS_PER_PAGE = 10;

    const MAX_MESSAGE_LENGTH = 2000;
    const MAX_STACK_LENGTH = 5000;

    const LEVELS = ['info', 'warn', 'error'];

    // =========================================================================
    // ESTADO DE LA PÁGINA
    // =========================================================================

    let proxyUrl = null;
    let reportsSent = 0;
    const alreadySent = {};
    /** Excepciones ya enviadas: si se relanzan, el envoltorio no las repite. */
    const reportedErrors = [];

    // =========================================================================
    // UTILIDADES
    // =========================================================================

    const resolveProxyUrl = () => {
        if (!proxyUrl) proxyUrl = url.resolveScript({ scriptId: PROXY.scriptId, deploymentId: PROXY.deploymentId });
        return proxyUrl;
    };

    const clientScriptId = () => {
        try {
            return runtime.getCurrentScript().id;
        } catch (e) {
            return undefined;
        }
    };

    /** Tipo e id del registro abierto; en un registro nuevo todavía no hay id. */
    const currentDocument = () => {
        try {
            const rec = currentRecord.get();
            return rec && rec.type ? { type: String(rec.type), id: rec.id ? String(rec.id) : undefined } : undefined;
        } catch (e) {
            return undefined;
        }
    };

    const currentPage = () => (typeof window !== 'undefined' && window.location ? window.location.pathname : undefined);

    /** Un Error del navegador o un SuiteScriptError, en un objeto que viaja como JSON. */
    const serializeError = (err) => {
        if (err === null || err === undefined) return undefined;
        if (typeof err !== 'object') return { name: 'Error', message: String(err) };
        const stack = Array.isArray(err.stack) ? err.stack.join('\n') : err.stack;
        return {
            name: String(err.name || 'Error'),
            message: String(err.message || ''),
            stack: stack ? String(stack).slice(0, MAX_STACK_LENGTH) : undefined
        };
    };

    // =========================================================================
    // ENVÍO
    // =========================================================================

    const send = (level, message, metadata, err) => {
        try {
            if (err && typeof err === 'object') {
                if (reportedErrors.indexOf(err) !== -1) return;
                reportedErrors.push(err);
            }

            const serialized = serializeError(err);
            const text = String(message === undefined || message === null ? '' : message).slice(0, MAX_MESSAGE_LENGTH);
            const dedupeKey = [level, text, serialized && serialized.name, serialized && serialized.message].join('|');
            if (alreadySent[dedupeKey] || reportsSent >= MAX_REPORTS_PER_PAGE) return;
            alreadySent[dedupeKey] = true;
            reportsSent++;

            const body = {
                clientScript: clientScriptId(),
                page: currentPage(),
                entries: [{
                    level: LEVELS.indexOf(level) === -1 ? 'error' : level,
                    message: text,
                    metadata: metadata && typeof metadata === 'object' && !Array.isArray(metadata) ? metadata : {},
                    error: serialized,
                    document: currentDocument()
                }]
            };

            https.post.promise({
                url: resolveProxyUrl(),
                body: JSON.stringify(body),
                headers: { 'Content-Type': 'application/json', [CLIENT_HEADER]: '1' }
            }).catch(() => {
                // Sin MCLog el formulario sigue funcionando: no hay nada que hacer.
            });
        } catch (e) {
            // Nunca rompe el formulario.
        }
    };

    // =========================================================================
    // API
    // =========================================================================

    /** Un hecho que conviene poder buscar. Úsalo poco: cada llamada es una petición. */
    const info = (message, metadata) => send('info', message, metadata);
    /** Algo raro que no impidió seguir. */
    const warn = (message, metadata, err) => send('warn', message, metadata, err);
    /** Un fallo sin excepción. */
    const error = (message, metadata, err) => send('error', message, metadata, err);
    /** Lo capturado en un catch: nivel error, con la clase y el stack. */
    const exception = (message, err, metadata) => send('error', message, metadata, err);

    /**
     * Envuelve los puntos de entrada del Client Script: una excepción que se
     * escape se envía a MCLog y se relanza, para que NetSuite la muestre igual
     * que sin la librería.
     *
     * @param {Object<string, Function>} entryPoints
     * @returns {Object<string, Function>}
     */
    const wrapEntryPoints = (entryPoints) => {
        const wrapped = {};
        Object.keys(entryPoints).forEach((name) => {
            const fn = entryPoints[name];
            wrapped[name] = typeof fn !== 'function' ? fn : function (context) {
                try {
                    return fn.apply(this, arguments);
                } catch (e) {
                    exception(`Error no controlado en ${name}`, e, {
                        entryPoint: name,
                        sublistId: context && context.sublistId,
                        fieldId: context && context.fieldId
                    });
                    throw e;
                }
            };
        });
        return wrapped;
    };

    return { info, warn, error, exception, wrapEntryPoints };
});
