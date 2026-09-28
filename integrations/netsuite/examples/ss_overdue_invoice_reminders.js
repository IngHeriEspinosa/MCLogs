/**
 * @NApiVersion 2.1
 * @NScriptType ScheduledScript
 * @NModuleScope SameAccount
 *
 * Receta 5 — Recordatorios de facturas vencidas (proceso programado)
 * ==================================================================
 *
 * Busca las facturas abiertas con más de N días de retraso y envía un correo
 * de recordatorio a cada una. Se programa, por ejemplo, cada mañana.
 *
 * QUÉ REGISTRA EN MCLOG
 *   - error  "No se pudo enviar el recordatorio": una por factura que falle,
 *            con traceId "invoice:<id>" y la excepción agrupada por su código.
 *   - warn   "Recordatorios detenidos por governance": se acabaron las unidades
 *            antes de terminar; dice cuántas facturas quedaron pendientes.
 *   - info   "Recordatorios de facturas vencidas terminados": un resumen con
 *            encontradas, enviadas, sin correo y fallidas. Si hubo fallos o se
 *            detuvo antes de tiempo, sale como warn "... terminados con incidencias".
 *   Lo que NO registra: una línea por cada correo enviado. Serían cientos de
 *   logs iguales; el resumen ya dice cuántos salieron.
 *
 * CÓMO INSTALARLO
 *   1. lib_mclog.js ya subida a /SuiteScripts/lib/ y configurada.
 *   2. Sube este fichero y crea el Script con los parámetros de PARAMS:
 *        custscript_mcl_ss_author    List/Record (Employee)  Remitente de los correos
 *        custscript_mcl_ss_min_days  Integer Number          Días de retraso mínimos (1 si vacío)
 *   3. Deployment: Status = Scheduled, con la frecuencia que quieras.
 *
 * Guía paso a paso: https://ingheriespinosa.github.io/MCLogs/docs/netsuite-recetario/
 *
 * @author Ing. Heri Espinosa
 * @license MIT
 */
define(['N/search', 'N/email', 'N/runtime', '/SuiteScripts/lib/lib_mclog'], (search, email, runtime, mcLog) => {

    // =========================================================================
    // CONFIGURACIÓN — lo que puedes adaptar
    // =========================================================================

    const PARAMS = {
        author: 'custscript_mcl_ss_author',
        minDaysOverdue: 'custscript_mcl_ss_min_days'
    };

    /** Facturas por ejecución. Para volúmenes mayores, pásalo a un Map/Reduce (receta 6). */
    const MAX_INVOICES_PER_RUN = 500;

    /** Unidades que se reservan para terminar: el correo cuesta 20 y el envío a MCLog, 20. */
    const MIN_USAGE_TO_CONTINUE = 100;

    /** Facturas sin correo que se listan en el resumen, para no inflar el log. */
    const MAX_SAMPLE = 20;

    // =========================================================================
    // LÓGICA
    // =========================================================================

    const readConfig = () => {
        const script = runtime.getCurrentScript();
        const minDays = Number(script.getParameter({ name: PARAMS.minDaysOverdue }));
        return {
            author: script.getParameter({ name: PARAMS.author }),
            minDaysOverdue: Number.isInteger(minDays) && minDays > 0 ? minDays : 1
        };
    };

    /** Ajusta los filtros a tu proceso: subsidiaria, tipo de cliente, importe mínimo... */
    const findOverdueInvoices = (minDaysOverdue) =>
        search.create({
            type: search.Type.INVOICE,
            filters: [
                ['mainline', 'is', 'T'], 'AND',
                ['status', 'anyof', 'CustInvc:A'], 'AND',
                ['daysoverdue', 'greaterthanorequalto', minDaysOverdue]
            ],
            columns: ['tranid', 'entity', 'email', 'amountremaining']
        }).run().getRange({ start: 0, end: MAX_INVOICES_PER_RUN }).map((result) => ({
            id: result.id,
            tranId: result.getValue({ name: 'tranid' }),
            customerId: result.getValue({ name: 'entity' }),
            email: String(result.getValue({ name: 'email' }) || '').trim(),
            amountRemaining: result.getValue({ name: 'amountremaining' })
        }));

    const sendReminder = (invoice, author) => {
        email.send({
            author,
            recipients: [invoice.email],
            subject: `Recordatorio: factura ${invoice.tranId} vencida`,
            body: `Le recordamos que la factura ${invoice.tranId} tiene un saldo pendiente de ${invoice.amountRemaining}.`,
            relatedRecords: { transactionId: Number(invoice.id) }
        });
    };

    const execute = () => {
        const config = readConfig();
        if (!config.author) {
            mcLog.error('Recordatorios sin configurar: falta el remitente', { parameter: PARAMS.author });
            return;
        }

        // Va en todos los logs de esta ejecución: en MCLog filtras por proceso.
        mcLog.setContext({ process: 'overdue-invoice-reminders', minDaysOverdue: config.minDaysOverdue });

        const invoices = findOverdueInvoices(config.minDaysOverdue);
        const totals = { found: invoices.length, sent: 0, withoutEmail: 0, failed: 0 };
        const withoutEmailSample = [];
        let pending = 0;

        for (let index = 0; index < invoices.length; index++) {
            if (runtime.getCurrentScript().getRemainingUsage() < MIN_USAGE_TO_CONTINUE) {
                pending = invoices.length - index;
                mcLog.warn('Recordatorios detenidos por governance', { ...totals, pending });
                break;
            }

            const invoice = invoices[index];
            if (!invoice.email) {
                totals.withoutEmail++;
                if (withoutEmailSample.length < MAX_SAMPLE) withoutEmailSample.push(invoice.tranId);
                continue;
            }

            // Dentro, los logs llevan el traceId "invoice:<id>"; al salir vuelve el de la ejecución.
            mcLog.withDocument('invoice', invoice.id, () => {
                try {
                    sendReminder(invoice, config.author);
                    totals.sent++;
                } catch (e) {
                    totals.failed++;
                    mcLog.exception('No se pudo enviar el recordatorio', e, { tranId: invoice.tranId, customerId: invoice.customerId });
                }
            });
        }

        const summary = { ...totals, pending, withoutEmailSample };
        if (totals.failed > 0 || pending > 0) {
            mcLog.warn('Recordatorios de facturas vencidas terminados con incidencias', summary);
        } else {
            mcLog.info('Recordatorios de facturas vencidas terminados', summary);
        }
    };

    return mcLog.wrapEntryPoints({ execute });
});
