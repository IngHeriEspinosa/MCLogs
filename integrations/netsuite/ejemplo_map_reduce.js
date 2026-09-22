/**
 * Ejemplo: Map/Reduce que acumula logs y los envía en lote en summarize
 * (una llamada HTTPS por cada 500 entradas = mínimo consumo de governance).
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
            // NetSuite entrega cada error serializado como JSON. Pasarlo en
            // `error` (y no en metadata) reparte su clase y su stack en campos
            // propios, y asi MCLog agrupa las repeticiones del mismo fallo.
            let parsed;
            try {
                parsed = JSON.parse(error);
            } catch (e) {
                parsed = { message: String(error) };
            }
            entries.push({
                level: 'error',
                ...APP,
                message: `Error en map para clave ${key}`,
                error: parsed,
                metadata: { key: key }
            });
            return true;
        });

        mclog.sendBatch(entries);
    };

    return { getInputData, map, summarize };
});
