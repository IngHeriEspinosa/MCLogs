/**
 * Ejemplo: Map/Reduce que acumula logs y los envía en lote en summarize
 * (1 sola llamada HTTPS = mínimo consumo de governance).
 *
 * @NApiVersion 2.1
 * @NScriptType MapReduceScript
 */
define(['/SuiteScripts/lib/mclog_client'], (mclog) => {

    const APP = { application: 'SuiteApp-SyncInventario', environment: 'production' };

    const getInputData = () => {
        // ... tu búsqueda ...
        return [];
    };

    const map = (context) => {
        // En map/reduce cada entrada corre aislada; para pocos eventos puntuales
        // puedes enviar directo:
        // mclog.send('warn', { ...APP, message: 'Item sin stock', metadata: { key: context.key } });
    };

    const summarize = (summary) => {
        const entries = [];

        entries.push({
            level: 'info',
            ...APP,
            message: 'Map/Reduce finalizado',
            metadata: {
                usage: summary.usage,
                seconds: summary.seconds,
                yields: summary.yields
            }
        });

        summary.mapSummary.errors.iterator().each((key, error) => {
            entries.push({
                level: 'error',
                ...APP,
                message: `Error en map para clave ${key}`,
                metadata: { error: error }
            });
            return true;
        });

        mclog.sendBatch(entries);
    };

    return { getInputData, map, summarize };
});
