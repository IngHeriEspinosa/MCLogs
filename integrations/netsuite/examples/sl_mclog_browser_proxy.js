/**
 * @NApiVersion 2.1
 * @NScriptType Suitelet
 * @NModuleScope SameAccount
 *
 * Receta 7 (servidor) — Proxy de logs para Client Scripts
 * =======================================================
 *
 * Recibe los logs que envía lib_mclog_browser.js desde el navegador y los
 * reenvía a MCLog con lib_mclog.js. Así la API key nunca sale del servidor.
 *
 * Todo lo que llega del navegador se trata como no fiable:
 *   - solo POST, con la cabecera X-MCLog-Client (bloquea formularios de otras webs);
 *   - cuerpo de como mucho LIMITS.maxBodyLength caracteres y LIMITS.maxEntries logs;
 *   - solo los niveles info, warn y error; textos recortados;
 *   - tipo e id de registro con formato válido, o se ignoran;
 *   - la metadata pasa por lib_mclog, que oculta claves como password o token.
 *   Cada log lleva metadata.source = "browser" y el Client Script que lo envió:
 *   el navegador no puede hacerse pasar por un script de servidor.
 *
 * Responde siempre JSON: { ok: true, accepted } o { ok: false, error }.
 *
 * CÓMO INSTALARLO
 *   1. lib_mclog.js y lib_mclog_browser.js ya subidas a /SuiteScripts/lib/.
 *   2. Sube este fichero y crea el Script con ID _mcl_browser_proxy.
 *   3. Deployment con ID _mcl_browser_proxy:
 *        Status = Released
 *        Available Without Login = NO (desmarcado): solo usuarios con sesión
 *        Audience = los roles que usan los formularios con Client Script
 *        Execute As Role = un rol con permiso View sobre customrecord_mclog_config
 *          (así los usuarios no necesitan ver el registro con la API key)
 *
 * Guía paso a paso: https://ingheriespinosa.github.io/MCLogs/docs/netsuite-recetario/
 *
 * @author Ing. Heri Espinosa
 * @license MIT
 */
define(['/SuiteScripts/lib/lib_mclog'], (mcLog) => {

    // =========================================================================
    // CONFIGURACIÓN — lo que puedes adaptar
    // =========================================================================

    const CLIENT_HEADER = 'x-mclog-client';

    const LIMITS = {
        maxBodyLength: 20000,
        maxEntries: 5,
        maxMessageLength: 2000,
        maxErrorNameLength: 200,
        maxStackLength: 5000,
        maxPageLength: 300
    };

    // =========================================================================
    // VALIDACIÓN
    // =========================================================================

    const LOG_BY_LEVEL = { info: mcLog.info, warn: mcLog.warn, error: mcLog.error };
    const RECORD_TYPE = /^[a-z][a-z0-9_]{0,59}$/;
    const RECORD_ID = /^\d{1,20}$/;
    const SCRIPT_ID = /^customscript[a-z0-9_]{1,80}$/;

    const text = (value, max) => (typeof value === 'string' ? value.slice(0, max) : '');

    const isPlainObject = (value) => !!value && typeof value === 'object' && !Array.isArray(value);

    /** NetSuite no garantiza el uso de mayúsculas en los nombres de cabecera. */
    const headerValue = (headers, name) => {
        const key = Object.keys(headers || {}).find((header) => header.toLowerCase() === name);
        return key ? headers[key] : undefined;
    };

    const toError = (raw) => {
        if (!isPlainObject(raw) || typeof raw.message !== 'string') return undefined;
        return {
            name: text(raw.name, LIMITS.maxErrorNameLength) || 'Error',
            message: text(raw.message, LIMITS.maxMessageLength),
            stack: text(raw.stack, LIMITS.maxStackLength) || undefined
        };
    };

    const toDocument = (raw) => {
        if (!isPlainObject(raw) || !RECORD_TYPE.test(String(raw.type))) return {};
        return RECORD_ID.test(String(raw.id)) ? { type: raw.type, id: String(raw.id) } : { type: raw.type };
    };

    /** Una entrada válida, o null si no lo es (se descarta sin romper las demás). */
    const toEntry = (raw) => {
        if (!isPlainObject(raw) || !LOG_BY_LEVEL[raw.level]) return null;
        const message = text(raw.message, LIMITS.maxMessageLength).trim();
        if (!message) return null;
        return {
            log: LOG_BY_LEVEL[raw.level],
            message,
            metadata: isPlainObject(raw.metadata) ? raw.metadata : {},
            error: toError(raw.error),
            document: toDocument(raw.document)
        };
    };

    const parsePayload = (request) => {
        if (request.method !== 'POST') return { error: 'Solo se admite POST' };
        if (headerValue(request.headers, CLIENT_HEADER) !== '1') return { error: 'Falta la cabecera X-MCLog-Client' };

        const body = String(request.body || '');
        if (body.length > LIMITS.maxBodyLength) return { error: 'Cuerpo demasiado grande' };

        let payload;
        try {
            payload = JSON.parse(body);
        } catch (e) {
            return { error: 'JSON no válido' };
        }
        if (!isPlainObject(payload) || !Array.isArray(payload.entries)) return { error: 'Falta la lista entries' };
        return { payload };
    };

    // =========================================================================
    // PUNTO DE ENTRADA
    // =========================================================================

    const reply = (response, result) => {
        response.setHeader({ name: 'Content-Type', value: 'application/json' });
        response.write({ output: JSON.stringify(result) });
    };

    const onRequest = (context) => {
        const { payload, error } = parsePayload(context.request);
        if (error) {
            reply(context.response, { ok: false, error });
            return;
        }

        const origin = {
            source: 'browser',
            clientScript: SCRIPT_ID.test(String(payload.clientScript)) ? payload.clientScript : 'unknown',
            page: text(payload.page, LIMITS.maxPageLength) || undefined
        };

        const entries = payload.entries.slice(0, LIMITS.maxEntries).map(toEntry).filter(Boolean);
        entries.forEach((entry) => {
            // origin va al final: el navegador no puede sobrescribir source ni clientScript.
            const metadata = { ...entry.metadata, recordType: entry.document.type, ...origin };
            // Con tipo e id, el traceId es "<tipo>:<id>", el mismo que en tus scripts de servidor.
            mcLog.withDocument(entry.document.type, entry.document.id, () => entry.log(entry.message, metadata, entry.error));
        });

        reply(context.response, { ok: true, accepted: entries.length });
    };

    return mcLog.wrapEntryPoints({ onRequest });
});
