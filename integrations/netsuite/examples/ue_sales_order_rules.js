/**
 * @NApiVersion 2.1
 * @NScriptType UserEventScript
 * @NModuleScope SameAccount
 *
 * Receta 3 — Bloquear un pedido que no cumple una regla de negocio
 * ================================================================
 *
 * Antes de guardar una orden de venta, comprueba una lista de reglas. Si una no
 * se cumple, el guardado se bloquea con un mensaje para el usuario y queda
 * constancia en MCLog de qué regla saltó y con qué datos.
 *
 * Las reglas están en RULES: para añadir una, copia un bloque y cambia su
 * código, su mensaje y su comprobación. No hay que tocar nada más.
 *
 * QUÉ REGISTRA EN MCLOG
 *   - warn  "Pedido bloqueado por una regla de negocio": el código de la regla
 *           y los datos que la hicieron saltar.
 *   Es warn y no error: el sistema funcionó bien, fue el usuario quien intentó
 *   algo no permitido. Cada regla tiene su código (MC_PO_REQUIRED...), así que
 *   en la pantalla Errores de MCLog ves cuántas veces salta cada una.
 *
 * CÓMO INSTALARLO
 *   1. lib_mclog.js ya subida a /SuiteScripts/lib/ y configurada.
 *   2. Sube este fichero y crea el Script con los parámetros de PARAMS:
 *        custscript_mcl_rules_po_from   Decimal Number  Importe desde el que la OC es obligatoria
 *        custscript_mcl_rules_max_qty   Integer Number  Cantidad máxima por línea
 *   3. Deployment: Applies To = Sales Order, Status = Testing hasta probarlo.
 *
 * Guía paso a paso: https://ingheriespinosa.github.io/MCLogs/docs/netsuite-recetario/
 *
 * @author Ing. Heri Espinosa
 * @license MIT
 */
define(['N/error', 'N/runtime', '/SuiteScripts/lib/lib_mclog'], (error, runtime, mcLog) => {

    // =========================================================================
    // CONFIGURACIÓN — lo que puedes adaptar
    // =========================================================================

    const PARAMS = {
        poRequiredFrom: 'custscript_mcl_rules_po_from',
        maxQuantityPerLine: 'custscript_mcl_rules_max_qty'
    };

    /** Valores que se usan si el parámetro está vacío en el Deployment. */
    const DEFAULTS = {
        poRequiredFrom: 10000,
        maxQuantityPerLine: 500
    };

    /**
     * Reglas, en orden de importancia: se para en la primera que no se cumple.
     * `check` devuelve null si el pedido la cumple, o los datos que la rompen.
     */
    const RULES = [
        {
            code: 'MC_PO_REQUIRED',
            message: (config) => `Los pedidos desde ${config.poRequiredFrom} necesitan número de orden de compra (OC).`,
            check: (order, config) => {
                const total = Number(order.getValue({ fieldId: 'total' })) || 0;
                const poNumber = String(order.getValue({ fieldId: 'otherrefnum' }) || '').trim();
                return total >= config.poRequiredFrom && !poNumber ? { total, poRequiredFrom: config.poRequiredFrom } : null;
            }
        },
        {
            code: 'MC_LINE_QUANTITY_LIMIT',
            message: (config) => `Ninguna línea puede pasar de ${config.maxQuantityPerLine} unidades.`,
            check: (order, config) => {
                const lineCount = order.getLineCount({ sublistId: 'item' });
                for (let line = 0; line < lineCount; line++) {
                    const quantity = Number(order.getSublistValue({ sublistId: 'item', fieldId: 'quantity', line })) || 0;
                    if (quantity > config.maxQuantityPerLine) {
                        return { line: line + 1, quantity, maxQuantityPerLine: config.maxQuantityPerLine };
                    }
                }
                return null;
            }
        }
    ];

    // =========================================================================
    // LÓGICA
    // =========================================================================

    const numberParam = (name, fallback) => {
        const value = Number(runtime.getCurrentScript().getParameter({ name }));
        return Number.isFinite(value) && value > 0 ? value : fallback;
    };

    const readConfig = () => ({
        poRequiredFrom: numberParam(PARAMS.poRequiredFrom, DEFAULTS.poRequiredFrom),
        maxQuantityPerLine: numberParam(PARAMS.maxQuantityPerLine, DEFAULTS.maxQuantityPerLine)
    });

    const beforeSubmit = (context) => {
        // Una edición en línea (XEDIT) solo trae los campos cambiados: las
        // reglas darían falsos positivos.
        if (context.type !== context.UserEventType.CREATE && context.type !== context.UserEventType.EDIT) return;

        const config = readConfig();
        const order = context.newRecord;

        for (const rule of RULES) {
            const violation = rule.check(order, config);
            if (!violation) continue;

            const blocked = error.create({ name: rule.code, message: rule.message(config), notifyOff: true });
            // El error va como tercer argumento: guarda su código para agrupar
            // sin subir el nivel a error, y el envoltorio no lo registra otra
            // vez como "Error no controlado" al relanzarlo.
            mcLog.warn('Pedido bloqueado por una regla de negocio', { rule: rule.code, ...violation }, blocked);
            throw blocked;
        }
    };

    return mcLog.wrapEntryPoints({ beforeSubmit });
});
