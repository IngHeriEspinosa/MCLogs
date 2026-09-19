/**
 * Ejemplo: User Event Script que envía logs a MCLog.
 * Ajusta la ruta del módulo a donde subiste mclog_client.js en tu File Cabinet.
 *
 * @NApiVersion 2.1
 * @NScriptType UserEventScript
 */
define(['/SuiteScripts/lib/mclog_client'], (mclog) => {

    const appLog = mclog.createLogger({
        application: 'SuiteApp-Facturacion',
        environment: 'production'
    });

    const afterSubmit = (context) => {
        try {
            const record = context.newRecord;
            appLog.info(`Factura ${record.id} guardada`, {
                recordType: record.type,
                recordId: record.id,
                eventType: context.type
            });

            // ... tu lógica de negocio ...

        } catch (e) {
            appLog.error(`Fallo en afterSubmit de factura: ${e.message}`, {
                stack: e.stack,
                recordId: context.newRecord && context.newRecord.id
            });
            throw e; // re-lanza si quieres que NetSuite marque el error
        }
    };

    return { afterSubmit };
});
