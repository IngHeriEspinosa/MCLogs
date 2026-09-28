/**
 * @NApiVersion 2.1
 * @NScriptType ClientScript
 * @NModuleScope SameAccount
 *
 * Receta 7 (navegador) — Errores de un formulario en MCLog
 * ========================================================
 *
 * Client Script de la orden de venta: al elegir el cliente, consulta si está
 * retenido por crédito y avisa al usuario. Si la consulta falla (permisos del
 * rol, un campo que ya no existe...), el usuario puede seguir trabajando y el
 * fallo queda en MCLog, en lugar de perderse en la consola del navegador.
 *
 * QUÉ REGISTRA EN MCLOG
 *   - error "No se pudo consultar la retención de crédito del cliente": con el
 *           id del cliente y la excepción.
 *   - error "Error no controlado en <punto de entrada>": cualquier excepción
 *           que se escape. La registra lib_mclog_browser sola y la relanza.
 *   Todos llevan metadata.source = "browser", el id de este script y la página.
 *
 * CÓMO INSTALARLO
 *   1. Instala antes el proxy (sl_mclog_browser_proxy.js) y sube
 *      lib_mclog_browser.js a /SuiteScripts/lib/.
 *   2. Sube este fichero, crea el Script y un Deployment:
 *        Applies To = Sales Order, Status = Testing hasta probarlo.
 *
 * Guía paso a paso: https://ingheriespinosa.github.io/MCLogs/docs/netsuite-recetario/
 *
 * @author Ing. Heri Espinosa
 * @license MIT
 */
define(['N/search', 'N/ui/dialog', '/SuiteScripts/lib/lib_mclog_browser'], (search, dialog, mcLogBrowser) => {

    /** Valor de "Credit Hold Override" que significa retenido. */
    const CREDIT_HOLD_ON = 'ON';

    /** lookupFields devuelve las listas como [{ value, text }]. */
    const selectValue = (field) => (Array.isArray(field) ? (field[0] && field[0].value) : field);

    const warnIfCreditHold = (customerId) => {
        let fields;
        try {
            fields = search.lookupFields({ type: search.Type.CUSTOMER, id: customerId, columns: ['creditholdoverride'] });
        } catch (e) {
            // El usuario sigue trabajando: el aviso es una ayuda, no un requisito.
            mcLogBrowser.exception('No se pudo consultar la retención de crédito del cliente', e, { customerId });
            return;
        }

        if (selectValue(fields.creditholdoverride) === CREDIT_HOLD_ON) {
            dialog.alert({
                title: 'Cliente retenido',
                message: 'Este cliente tiene la retención de crédito activa. El pedido necesitará aprobación.'
            });
        }
    };

    const fieldChanged = (context) => {
        if (context.fieldId !== 'entity') return;
        const customerId = context.currentRecord.getValue({ fieldId: 'entity' });
        if (customerId) warnIfCreditHold(customerId);
    };

    return mcLogBrowser.wrapEntryPoints({ fieldChanged });
});
