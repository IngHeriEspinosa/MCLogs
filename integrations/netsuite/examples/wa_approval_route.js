/**
 * @NApiVersion 2.1
 * @NScriptType WorkflowActionScript
 * @NModuleScope SameAccount
 *
 * Receta 4 — Decidir la ruta de aprobación dentro de un workflow
 * ==============================================================
 *
 * Una acción de workflow que responde "¿necesita este documento aprobación de
 * dirección?". El workflow usa la respuesta (T/F) en una condición de
 * transición: si es T, va al estado "Aprobación de dirección".
 *
 * QUÉ REGISTRA EN MCLOG
 *   - info   "Documento enviado a aprobación de dirección": total, límite y workflow.
 *   - debug  "Documento dentro del límite: aprobación estándar". En producción
 *            no sale (lib_mclog descarta debug ahí): úsalo para probar en sandbox
 *            sin llenar MCLog con el caso normal.
 *   - warn   "Límite de aprobación sin configurar": falta el parámetro y se
 *            usa DEFAULT_LIMIT. Mejor enterarse por MCLog que por una auditoría.
 *   El traceId es "<tipo>:<id>" del documento: el mismo que en los demás scripts.
 *
 * CÓMO INSTALARLO
 *   1. lib_mclog.js ya subida a /SuiteScripts/lib/ y configurada.
 *   2. Sube este fichero y crea el Script:
 *        Return Type = Checkbox
 *        Parámetro custscript_mcl_wa_limit  Decimal Number  Importe a partir del cual decide dirección
 *   3. Deployment: Applies To = el tipo de registro del workflow, Status = Released.
 *   4. En el workflow, añade la acción "Custom Action" con este script en el
 *      estado que decide, guarda su resultado en un campo o variable del
 *      workflow y úsalo en la condición de la transición.
 *
 * Guía paso a paso: https://ingheriespinosa.github.io/MCLogs/docs/netsuite-recetario/
 *
 * @author Ing. Heri Espinosa
 * @license MIT
 */
define(['N/runtime', '/SuiteScripts/lib/lib_mclog'], (runtime, mcLog) => {

    // =========================================================================
    // CONFIGURACIÓN — lo que puedes adaptar
    // =========================================================================

    const PARAM_LIMIT = 'custscript_mcl_wa_limit';

    /** Límite que se aplica si el parámetro está vacío o no es un número válido. */
    const DEFAULT_LIMIT = 50000;

    // =========================================================================
    // LÓGICA
    // =========================================================================

    const readLimit = () => {
        // Un parámetro vacío llega como '' o null, y los dos se convierten en 0.
        const limit = Number(runtime.getCurrentScript().getParameter({ name: PARAM_LIMIT }));
        if (Number.isFinite(limit) && limit > 0) return limit;

        mcLog.warn('Límite de aprobación sin configurar', { parameter: PARAM_LIMIT, defaultLimit: DEFAULT_LIMIT });
        return DEFAULT_LIMIT;
    };

    const onAction = (context) => {
        const limit = readLimit();
        const total = Number(context.newRecord.getValue({ fieldId: 'total' })) || 0;
        const needsDirector = total >= limit;
        const details = { total, limit, workflowId: context.workflowId };

        if (needsDirector) {
            mcLog.info('Documento enviado a aprobación de dirección', details);
        } else {
            mcLog.debug('Documento dentro del límite: aprobación estándar', details);
        }
        return needsDirector ? 'T' : 'F';
    };

    return mcLog.wrapEntryPoints({ onAction });
});
