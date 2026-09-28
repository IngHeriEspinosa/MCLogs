/**
 * @NApiVersion 2.1
 * @NScriptType UserEventScript
 * @NModuleScope SameAccount
 *
 * Receta 1 — Enviar una factura a un proveedor externo (integración de salida)
 * ===========================================================================
 *
 * Cada vez que se crea o se edita una factura, la envía a la API de un
 * proveedor (facturación electrónica, un ERP del cliente, un portal...) y deja
 * en MCLog el resultado de la llamada.
 *
 * QUÉ REGISTRA EN MCLOG
 *   - info   "Factura enviada al proveedor": código HTTP, duración e id del proveedor.
 *   - error  "El proveedor rechazó la factura": código HTTP y el inicio de su respuesta.
 *   - error  "No se pudo conectar con el proveedor": la excepción de red, con su stack.
 *   - warn   "Envío al proveedor sin configurar": falta un parámetro del deployment.
 *   Todos llevan el traceId "invoice:<id>": en MCLog, "Ver traza" muestra la
 *   historia de la factura en todos tus scripts.
 *
 * QUÉ NO REGISTRA (a propósito)
 *   - El cuerpo que se envía: lleva datos del cliente. Basta con el total y los ids.
 *   - La URL con su query string ni el token: solo el host y la ruta.
 *
 * CÓMO INSTALARLO
 *   1. lib_mclog.js ya subida a /SuiteScripts/lib/ y configurada.
 *   2. Guarda el token del proveedor como API Secret (Setup → Company →
 *      API Secrets) y permite su uso a este script.
 *   3. Sube este fichero y crea el Script con los parámetros de PARAMS:
 *        custscript_mcl_prov_url     Free-Form Text  URL completa del endpoint
 *        custscript_mcl_prov_secret  Free-Form Text  ID del secreto (custsecret_...)
 *   4. Deployment: Applies To = Invoice, Status = Testing hasta probarlo.
 *
 * Guía paso a paso: https://ingheriespinosa.github.io/MCLogs/docs/netsuite-recetario/
 *
 * @author Ing. Heri Espinosa
 * @license MIT
 */
define(['N/https', 'N/runtime', '/SuiteScripts/lib/lib_mclog'], (https, runtime, mcLog) => {

    // =========================================================================
    // CONFIGURACIÓN — lo que puedes adaptar
    // =========================================================================

    /** Parámetros del Script (pestaña Parameters). Sus valores se ponen en el Deployment. */
    const PARAMS = {
        url: 'custscript_mcl_prov_url',
        secretId: 'custscript_mcl_prov_secret'
    };

    /** Cuánto de la respuesta del proveedor se guarda en el log cuando rechaza la factura. */
    const MAX_RESPONSE_IN_LOG = 1000;

    // =========================================================================
    // LÓGICA
    // =========================================================================

    const readConfig = () => {
        const script = runtime.getCurrentScript();
        return {
            url: String(script.getParameter({ name: PARAMS.url }) || '').trim(),
            secretId: String(script.getParameter({ name: PARAMS.secretId }) || '').trim()
        };
    };

    /** Host y ruta, sin query string: ahí suelen viajar tokens y datos del cliente. */
    const endpointForLog = (url) => url.split('?')[0];

    /** Lo que espera el proveedor. Ajusta los campos a su contrato. */
    const buildPayload = (invoice) => {
        const lines = [];
        const lineCount = invoice.getLineCount({ sublistId: 'item' });
        for (let line = 0; line < lineCount; line++) {
            lines.push({
                item: invoice.getSublistValue({ sublistId: 'item', fieldId: 'item', line }),
                quantity: invoice.getSublistValue({ sublistId: 'item', fieldId: 'quantity', line }),
                rate: invoice.getSublistValue({ sublistId: 'item', fieldId: 'rate', line }),
                amount: invoice.getSublistValue({ sublistId: 'item', fieldId: 'amount', line })
            });
        }
        return {
            invoiceId: invoice.id,
            number: invoice.getValue({ fieldId: 'tranid' }),
            customerId: invoice.getValue({ fieldId: 'entity' }),
            currency: invoice.getValue({ fieldId: 'currency' }),
            total: invoice.getValue({ fieldId: 'total' }),
            lines
        };
    };

    /** El token nunca está en el código: NetSuite lo sustituye al enviar. */
    const buildHeaders = (config) => ({
        'Content-Type': 'application/json',
        'x-api-key': https.createSecureString({ input: `{${config.secretId}}` })
    });

    /** Id que devuelve el proveedor, si su respuesta es JSON y lo trae. */
    const providerIdFrom = (body) => {
        try {
            const parsed = JSON.parse(body);
            return parsed && (parsed.id || parsed.uuid) ? String(parsed.id || parsed.uuid) : undefined;
        } catch (e) {
            return undefined;
        }
    };

    const afterSubmit = (context) => {
        // Solo altas y ediciones: una edición en línea (XEDIT) no trae la factura completa.
        if (context.type !== context.UserEventType.CREATE && context.type !== context.UserEventType.EDIT) return;

        const config = readConfig();
        if (!config.url || !config.secretId) {
            mcLog.warn('Envío al proveedor sin configurar', {
                missing: [!config.url && PARAMS.url, !config.secretId && PARAMS.secretId].filter(Boolean)
            });
            return;
        }

        const payload = buildPayload(context.newRecord);
        const details = { endpoint: endpointForLog(config.url), total: payload.total, lines: payload.lines.length };
        const startedAt = Date.now();

        let response;
        try {
            response = https.post({ url: config.url, body: JSON.stringify(payload), headers: buildHeaders(config) });
        } catch (e) {
            // La factura ya está guardada: un fallo del proveedor no debe impedir
            // trabajar en NetSuite. Queda registrado para reenviarla después.
            mcLog.exception('No se pudo conectar con el proveedor', e, { ...details, durationMs: Date.now() - startedAt });
            return;
        }

        const result = { ...details, httpStatus: response.code, durationMs: Date.now() - startedAt };
        if (response.code >= 200 && response.code < 300) {
            mcLog.info('Factura enviada al proveedor', { ...result, providerId: providerIdFrom(response.body) });
        } else {
            mcLog.error('El proveedor rechazó la factura', {
                ...result,
                providerResponse: String(response.body || '').slice(0, MAX_RESPONSE_IN_LOG)
            });
        }
    };

    return mcLog.wrapEntryPoints({ afterSubmit });
});
