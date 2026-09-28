/**
 * @NApiVersion 2.1
 * @NScriptType Restlet
 * @NModuleScope SameAccount
 *
 * Receta 2 — Recibir pedidos de un e-commerce (integración de entrada)
 * ====================================================================
 *
 * Un sistema externo (tienda online, marketplace, app móvil) llama a este
 * RESTlet con un pedido en JSON. El RESTlet lo valida, evita duplicados y crea
 * la orden de venta.
 *
 *   POST  { "externalId": "WEB-1001", "customerId": 123,
 *           "lines": [ { "itemId": 45, "quantity": 2, "rate": 10.5 } ] }
 *
 * QUÉ REGISTRA EN MCLOG
 *   - warn   "Pedido rechazado por datos inválidos": la lista de problemas.
 *   - info   "Pedido duplicado: se devuelve el existente": el sistema externo reintentó.
 *   - info   "Pedido creado desde el e-commerce": número de líneas.
 *   - error  "No se pudo crear el pedido": la excepción de NetSuite, agrupada por su código.
 *   Todos llevan el traceId "weborder:<externalId>". Es el número que soporte
 *   recibe del cliente: escribiéndolo en la búsqueda de MCLog aparecen todos los
 *   intentos de ese pedido, también los rechazados. El id de la orden de venta
 *   creada va en metadata.salesOrderId.
 *
 * QUÉ DEVUELVE
 *   { ok: true, id, duplicate? }  o  { ok: false, errors: [ { field?, code?, message } ] }
 *   Ante un fallo de NetSuite solo se devuelve su código (INVALID_KEY_OR_REF...),
 *   no el mensaje: el detalle, con el stack, queda en MCLog.
 *
 * CÓMO INSTALARLO
 *   1. lib_mclog.js ya subida a /SuiteScripts/lib/ y configurada.
 *   2. Sube este fichero, crea el Script y un Deployment con Status = Released
 *      y los roles de la integración (la que usa el sistema externo con TBA).
 *
 * Guía paso a paso: https://ingheriespinosa.github.io/MCLogs/docs/netsuite-recetario/
 *
 * @author Ing. Heri Espinosa
 * @license MIT
 */
define(['N/record', 'N/search', '/SuiteScripts/lib/lib_mclog'], (record, search, mcLog) => {

    // =========================================================================
    // CONFIGURACIÓN — lo que puedes adaptar
    // =========================================================================

    /** Un pedido con más líneas se rechaza: protege la governance del RESTlet. */
    const MAX_LINES = 200;
    const MAX_EXTERNAL_ID_LENGTH = 60;

    // =========================================================================
    // LÓGICA
    // =========================================================================

    const isPositiveInteger = (value) => Number.isInteger(value) && value > 0;
    const isNonNegativeNumber = (value) => typeof value === 'number' && Number.isFinite(value) && value >= 0;

    /** Todo lo que llega de fuera se valida antes de tocar un registro. */
    const validateOrder = (body) => {
        if (!body || typeof body !== 'object' || Array.isArray(body)) {
            return [{ message: 'El cuerpo debe ser un objeto JSON' }];
        }

        const problems = [];
        const externalId = typeof body.externalId === 'string' ? body.externalId.trim() : '';
        if (!externalId || externalId.length > MAX_EXTERNAL_ID_LENGTH) {
            problems.push({ field: 'externalId', message: `Obligatorio, de 1 a ${MAX_EXTERNAL_ID_LENGTH} caracteres` });
        }
        if (!isPositiveInteger(body.customerId)) {
            problems.push({ field: 'customerId', message: 'Debe ser el id interno del cliente' });
        }
        if (!Array.isArray(body.lines) || body.lines.length === 0 || body.lines.length > MAX_LINES) {
            problems.push({ field: 'lines', message: `Entre 1 y ${MAX_LINES} líneas` });
            return problems;
        }

        body.lines.forEach((line, index) => {
            if (!line || !isPositiveInteger(line.itemId)) {
                problems.push({ field: `lines[${index}].itemId`, message: 'Debe ser el id interno del artículo' });
            }
            if (!line || !(isNonNegativeNumber(line.quantity) && line.quantity > 0)) {
                problems.push({ field: `lines[${index}].quantity`, message: 'Debe ser mayor que cero' });
            }
            if (line && line.rate !== undefined && !isNonNegativeNumber(line.rate)) {
                problems.push({ field: `lines[${index}].rate`, message: 'Debe ser un número mayor o igual que cero' });
            }
        });
        return problems;
    };

    /** Si el sistema externo reintenta, no se crea un segundo pedido. */
    const findOrderByExternalId = (externalId) => {
        const results = search.create({
            type: search.Type.SALES_ORDER,
            filters: [['externalid', 'anyof', externalId], 'AND', ['mainline', 'is', 'T']],
            columns: ['internalid']
        }).run().getRange({ start: 0, end: 1 });
        return results.length ? results[0].id : null;
    };

    const createOrder = (order) => {
        const salesOrder = record.create({ type: record.Type.SALES_ORDER, isDynamic: true });
        salesOrder.setValue({ fieldId: 'entity', value: order.customerId });
        salesOrder.setValue({ fieldId: 'externalid', value: order.externalId });
        salesOrder.setValue({ fieldId: 'otherrefnum', value: order.externalId });

        order.lines.forEach((line) => {
            salesOrder.selectNewLine({ sublistId: 'item' });
            salesOrder.setCurrentSublistValue({ sublistId: 'item', fieldId: 'item', value: line.itemId });
            salesOrder.setCurrentSublistValue({ sublistId: 'item', fieldId: 'quantity', value: line.quantity });
            if (line.rate !== undefined) {
                salesOrder.setCurrentSublistValue({ sublistId: 'item', fieldId: 'rate', value: line.rate });
            }
            salesOrder.commitLine({ sublistId: 'item' });
        });

        return salesOrder.save();
    };

    const post = (body) => {
        const problems = validateOrder(body);
        const externalId = body && typeof body.externalId === 'string' ? body.externalId.trim().slice(0, MAX_EXTERNAL_ID_LENGTH) : '';
        // La búsqueda de MCLog no entra en la metadata, pero sí en el traceId: lo
        // que soporte vaya a buscar (el número del e-commerce) va aquí. Sin
        // externalId no cambia nada y los logs quedan en la traza de la ejecución.
        mcLog.setDocument('weborder', externalId);
        mcLog.setContext({ channel: 'ecommerce' });

        if (problems.length) {
            mcLog.warn('Pedido rechazado por datos inválidos', { problems });
            return { ok: false, errors: problems };
        }

        const order = { ...body, externalId };
        try {
            const existingId = findOrderByExternalId(externalId);
            if (existingId) {
                mcLog.info('Pedido duplicado: se devuelve el existente', { salesOrderId: existingId });
                return { ok: true, id: existingId, duplicate: true };
            }

            const id = createOrder(order);
            mcLog.info('Pedido creado desde el e-commerce', { salesOrderId: id, lines: order.lines.length });
            return { ok: true, id };
        } catch (e) {
            mcLog.exception('No se pudo crear el pedido', e, { customerId: order.customerId, lines: order.lines.length });
            return { ok: false, errors: [{ code: e.name || 'UNEXPECTED_ERROR', message: 'No se pudo crear el pedido' }] };
        }
    };

    return mcLog.wrapEntryPoints({ post });
});
