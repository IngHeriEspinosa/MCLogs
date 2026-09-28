/**
 * @NApiVersion 2.1
 * @NScriptType MapReduceScript
 * @NModuleScope SameAccount
 *
 * Receta 6 — Importar clientes desde un CSV (proceso masivo)
 * ==========================================================
 *
 * Lee un CSV del File Cabinet y crea un cliente por fila. Si un cliente ya
 * existe (mismo externalid), lo salta: puedes relanzar la importación sin
 * crear duplicados.
 *
 * El CSV lleva cabecera con estas columnas, en cualquier orden y separadas por
 * coma o por punto y coma (el de Excel en español):
 *     externalid;companyname;email;phone
 *
 * QUÉ REGISTRA EN MCLOG
 *   - info  "Importación de clientes: fichero leído": filas encontradas.
 *   - info  "Importación de clientes terminada": creados, ya existentes y
 *           rechazados. Si hubo rechazados, sale como warn "... con filas
 *           rechazadas" con una muestra: número de línea y motivo.
 *   - error "Error no controlado en map": un fallo inesperado al guardar un
 *           cliente. Lo registra lib_mclog sola, con la línea del CSV en metadata.
 *   - lib_mclog añade al final su propio resumen: governance, segundos y
 *     errores por etapa.
 *
 * LA REGLA DE ORO EN MAP/REDUCE
 *   Cada map es una ejecución aparte: un log en cada una es una petición HTTPS
 *   por fila. Con 10 000 filas chocarías con el límite de MCLog. Por eso las
 *   filas rechazadas no se registran una a una: se anotan con context.write y
 *   se resumen en summarize, en un solo log.
 *
 * CÓMO INSTALARLO
 *   1. lib_mclog.js ya subida a /SuiteScripts/lib/ y configurada.
 *   2. Sube el CSV al File Cabinet y apunta su id interno.
 *   3. Sube este fichero y crea el Script con los parámetros de PARAMS:
 *        custscript_mcl_mr_file        Integer Number        Id interno del CSV
 *        custscript_mcl_mr_subsidiary  List/Record (Subsidiary)  Solo en cuentas OneWorld
 *   4. Deployment: Status = Not Scheduled y ejecútalo con "Save and Execute".
 *
 * Guía paso a paso: https://ingheriespinosa.github.io/MCLogs/docs/netsuite-recetario/
 *
 * @author Ing. Heri Espinosa
 * @license MIT
 */
define(['N/error', 'N/file', 'N/record', 'N/runtime', 'N/search', '/SuiteScripts/lib/lib_mclog'],
    (error, file, record, runtime, search, mcLog) => {

    // =========================================================================
    // CONFIGURACIÓN — lo que puedes adaptar
    // =========================================================================

    const PARAMS = {
        fileId: 'custscript_mcl_mr_file',
        subsidiary: 'custscript_mcl_mr_subsidiary'
    };

    /** Columnas del CSV (en minúsculas) y si son obligatorias en cada fila. */
    const COLUMNS = {
        externalid: { required: true },
        companyname: { required: true },
        email: { required: false },
        phone: { required: false }
    };

    /** Filas rechazadas que se incluyen en el resumen, para no inflar el log. */
    const MAX_REJECTED_SAMPLE = 20;

    const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    // =========================================================================
    // LECTURA DEL CSV
    // =========================================================================

    /** Separa una línea respetando comillas: "Pérez, S.A." es un solo valor. */
    const parseCsvLine = (line, separator) => {
        const values = [];
        let current = '';
        let quoted = false;
        for (let i = 0; i < line.length; i++) {
            const char = line[i];
            if (quoted) {
                if (char === '"' && line[i + 1] === '"') {
                    current += '"';
                    i++;
                } else if (char === '"') {
                    quoted = false;
                } else {
                    current += char;
                }
            } else if (char === '"') {
                quoted = true;
            } else if (char === separator) {
                values.push(current.trim());
                current = '';
            } else {
                current += char;
            }
        }
        values.push(current.trim());
        return values;
    };

    /** Excel en español guarda con punto y coma; en inglés, con coma. */
    const detectSeparator = (headerLine) =>
        headerLine.split(';').length > headerLine.split(',').length ? ';' : ',';

    const readRows = (fileId) => {
        const rows = [];
        let header = null;
        let separator = ',';
        let lineNumber = 0;

        file.load({ id: fileId }).lines.iterator().each((line) => {
            lineNumber++;
            const text = line.value.replace(/^﻿/, ''); // BOM que añade Excel
            if (!text.trim()) return true;

            if (!header) {
                separator = detectSeparator(text);
                header = parseCsvLine(text, separator).map((name) => name.toLowerCase());
                const missing = Object.keys(COLUMNS).filter((name) => COLUMNS[name].required && header.indexOf(name) === -1);
                if (missing.length) {
                    throw error.create({
                        name: 'MC_IMPORT_BAD_HEADER',
                        message: `Faltan columnas en la cabecera del CSV: ${missing.join(', ')}`
                    });
                }
                return true;
            }

            const values = parseCsvLine(text, separator);
            const row = {};
            header.forEach((name, index) => {
                if (COLUMNS[name]) row[name] = values[index] || '';
            });
            rows.push({ line: lineNumber, values: row });
            return true;
        });

        return rows;
    };

    // =========================================================================
    // ETAPAS DEL MAP/REDUCE
    // =========================================================================

    const getInputData = () => {
        const fileId = runtime.getCurrentScript().getParameter({ name: PARAMS.fileId });
        if (!fileId) {
            // Sin capturar a propósito: lib_mclog la registra sola y NetSuite
            // marca la ejecución como fallida.
            throw error.create({ name: 'MC_IMPORT_NOT_CONFIGURED', message: `Falta el parámetro ${PARAMS.fileId}` });
        }

        const rows = readRows(fileId);
        mcLog.info('Importación de clientes: fichero leído', { fileId, rows: rows.length });
        return rows;
    };

    const validateRow = (values) => {
        const problems = Object.keys(COLUMNS)
            .filter((name) => COLUMNS[name].required && !values[name])
            .map((name) => `${name} vacío`);
        if (values.email && !EMAIL_PATTERN.test(values.email)) problems.push('email no válido');
        return problems;
    };

    const customerExists = (externalId) =>
        search.create({
            type: search.Type.CUSTOMER,
            filters: [['externalid', 'anyof', externalId]],
            columns: ['internalid']
        }).run().getRange({ start: 0, end: 1 }).length > 0;

    const createCustomer = (values) => {
        const customer = record.create({ type: record.Type.CUSTOMER, isDynamic: true });
        customer.setValue({ fieldId: 'isperson', value: 'F' });
        customer.setValue({ fieldId: 'companyname', value: values.companyname });
        customer.setValue({ fieldId: 'externalid', value: values.externalid });
        if (values.email) customer.setValue({ fieldId: 'email', value: values.email });
        if (values.phone) customer.setValue({ fieldId: 'phone', value: values.phone });

        const subsidiary = runtime.getCurrentScript().getParameter({ name: PARAMS.subsidiary });
        if (subsidiary) customer.setValue({ fieldId: 'subsidiary', value: subsidiary });

        return customer.save();
    };

    const map = (context) => {
        const row = JSON.parse(context.value);
        // Si createCustomer lanza, el log automático llevará la línea del CSV.
        mcLog.setContext({ csvLine: row.line, externalId: row.values.externalid });

        const problems = validateRow(row.values);
        if (problems.length) {
            context.write({ key: 'rejected', value: JSON.stringify({ line: row.line, problems }) });
            return;
        }
        if (customerExists(row.values.externalid)) {
            context.write({ key: 'skipped', value: String(row.line) });
            return;
        }

        const id = createCustomer(row.values);
        context.write({ key: 'created', value: String(id) });
    };

    const summarize = (summary) => {
        const totals = { created: 0, skipped: 0, rejected: 0 };
        const rejectedSample = [];

        // Sin etapa reduce, lo que escribe map llega tal cual a summary.output.
        summary.output.iterator().each((key, value) => {
            if (totals[key] === undefined) return true;
            totals[key]++;
            if (key === 'rejected' && rejectedSample.length < MAX_REJECTED_SAMPLE) rejectedSample.push(JSON.parse(value));
            return true;
        });

        if (totals.rejected > 0) {
            mcLog.warn('Importación de clientes terminada con filas rechazadas', { ...totals, rejectedSample });
        } else {
            mcLog.info('Importación de clientes terminada', totals);
        }
    };

    return mcLog.wrapEntryPoints({ getInputData, map, summarize });
});
