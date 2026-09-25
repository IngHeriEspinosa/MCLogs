/**
 * Pruebas de lib_mclog.js fuera de NetSuite.
 *
 *   node integrations/netsuite/test_lib_mclog.js
 *
 * Sin framework ni dependencias, como test_mclog_client.js: corre en CI con un
 * `node` pelado. Cada prueba carga una instancia nueva de la librería sobre un
 * NetSuite simulado (N/https, N/log, N/runtime, N/query y N/cache) y comprueba
 * lo que saldría por el cable.
 *
 * Lo que no cubre: lo que depende del runtime real (governance de verdad,
 * permisos de SuiteQL, caducidad de N/cache, un SuiteScriptError auténtico).
 * Eso solo se ve en una cuenta.
 */

const fs = require('fs');
const path = require('path');

const SOURCE = fs.readFileSync(path.join(__dirname, 'lib_mclog.js'), 'utf8');

/**
 * Lo que cada equipo adapta en la sección 1 de la librería se lee de ella
 * misma: así las pruebas siguen valiendo después de personalizarla.
 */
const readConstant = (pattern, name) => {
    const match = SOURCE.match(pattern);
    if (!match) throw new Error(`No se encontró ${name} en lib_mclog.js`);
    return match[1];
};
const SETTINGS_TYPE = readConstant(/SETTINGS_RECORD = \{\s*type: '([^']+)'/, 'SETTINGS_RECORD.type');
const DEFAULT_APPLICATION = readConstant(/DEFAULT_APPLICATION = '([^']+)'/, 'DEFAULT_APPLICATION');
const SKIP_DEBUG_IN_PRODUCTION = readConstant(/SKIP_DEBUG_IN_PRODUCTION = (true|false)/, 'SKIP_DEBUG_IN_PRODUCTION') === 'true';

// ---------------------------------------------------------------- simulación

const DEFAULT_ROW = {
    id: 1,
    url: 'https://mclog.example.com/',
    apikey: 'mclog_test_key',
    application: 'SuiteApp-Test',
    environment: 'Producción',
};

/**
 * Carga una instancia nueva de la librería sobre un NetSuite simulado.
 * `env` expone lo que la librería hizo y permite cambiar lo que ve.
 */
const createSandbox = (overrides = {}) => {
    const env = {
        rows: [DEFAULT_ROW],
        queryError: null,
        queries: [],
        requests: [],
        response: { code: 201, body: '{"status":"ok"}' },
        networkError: null,
        remainingUsage: 1000,
        envType: 'PRODUCTION',
        nsLogs: [],
        cacheStore: new Map(),
        ...overrides,
    };

    const nsLog = (level) => (options) => env.nsLogs.push({ level, title: options.title, details: String(options.details) });

    const modules = {
        'N/https': {
            post: ({ url, body, headers }) => {
                if (env.networkError) throw env.networkError;
                env.requests.push({ url, headers, body: JSON.parse(body), bytes: Buffer.byteLength(body, 'utf8') });
                return env.response;
            },
        },
        'N/log': { error: nsLog('error'), audit: nsLog('audit'), debug: nsLog('debug') },
        'N/runtime': {
            getCurrentScript: () => ({
                id: 'customscript_test',
                deploymentId: 'customdeploy_test',
                getRemainingUsage: () => env.remainingUsage,
            }),
            getCurrentUser: () => ({ id: 42, role: 3 }),
            executionContext: 'USERINTERFACE',
            accountId: 'TSTACCT',
            get envType() {
                return env.envType;
            },
        },
        'N/query': {
            runSuiteQL: (options) => {
                env.queries.push(options);
                if (env.queryError) throw env.queryError;
                return { asMappedResults: () => env.rows };
            },
        },
        'N/cache': {
            Scope: { PRIVATE: 'PRIVATE' },
            getCache: ({ name }) => ({
                get: ({ key, loader }) => {
                    const id = `${name}:${key}`;
                    if (!env.cacheStore.has(id)) env.cacheStore.set(id, loader());
                    return env.cacheStore.get(id);
                },
            }),
        },
    };

    let lib;
    const define = (deps, factory) => {
        lib = factory(...deps.map((name) => modules[name]));
    };
    new Function('define', SOURCE)(define);

    return { lib, env };
};

/** Todas las entradas enviadas, en orden, sin importar en cuántas peticiones. */
const sentLogs = (env) => env.requests.flatMap((request) => request.body.logs);

/** Ejecuta `body` como un punto de entrada envuelto y devuelve lo que se envió. */
const runEntryPoint = (lib, name, context, body) => lib.wrapEntryPoints({ [name]: body })[name](context);

const suiteScriptError = (overrides = {}) => ({
    name: 'INVALID_FLD_VALUE',
    message: 'Valor no válido para el campo entity',
    id: 'jwjzi2kd1rqw1t8wqtwh6',
    stack: ['createError(N/error)', 'afterSubmit(/SuiteScripts/ue_factura.js:42)'],
    ...overrides,
});

// ------------------------------------------------------------------ útiles

let failures = 0;
let checks = 0;

/**
 * `condition` se pasa como función para que una comprobación que reviente
 * —típico cuando falta la petición que se esperaba— cuente como fallo y deje
 * correr las demás.
 */
const check = (name, condition, detail) => {
    checks += 1;
    let passed;
    try {
        passed = typeof condition === 'function' ? condition() : condition;
    } catch (error) {
        passed = false;
        detail = `excepción: ${error.message}`;
    }
    if (passed) {
        console.log(`  ok    ${name}`);
    } else {
        console.log(`  FALLA ${name}${detail === undefined ? '' : ` -> ${detail}`}`);
        failures += 1;
    }
};

const group = (name) => console.log(`\n${name}`);

// ------------------------------------------------------------------ pruebas

group('Configuración desde el registro');
{
    const { lib, env } = createSandbox();
    runEntryPoint(lib, 'execute', { type: 'SCHEDULED' }, () => lib.info('hola'));
    const request = env.requests[0];
    check('envía una petición al endpoint de lotes', () => request.url === 'https://mclog.example.com/api/logs/batch', request && request.url);
    check('la API key viaja en su cabecera', () => request.headers['x-api-key'] === 'mclog_test_key');
    check('application sale del registro', () => request.body.logs[0].application === 'SuiteApp-Test');
    check('"Producción" se normaliza a production', () => request.body.logs[0].environment === 'production');
    check('SuiteQL filtra inactivos con parámetro, no concatenando', () => JSON.stringify(env.queries[0].params) === '["F"]');
    check('la consulta apunta al registro configurado', () => env.queries[0].query.includes(`FROM ${SETTINGS_TYPE}`));
}
{
    const { lib, env } = createSandbox({ rows: [{ ...DEFAULT_ROW, url: 'https://mclog.example.com/api/logs/batch/' }] });
    runEntryPoint(lib, 'execute', {}, () => lib.info('hola'));
    check('una URL pegada con el endpoint se recorta', () => env.requests[0].url === 'https://mclog.example.com/api/logs/batch', env.requests[0] && env.requests[0].url);
}
{
    const { lib, env } = createSandbox({
        rows: [{ ...DEFAULT_ROW, id: 1, apikey: '' }, { ...DEFAULT_ROW, id: 2, apikey: 'mclog_segunda' }],
    });
    runEntryPoint(lib, 'execute', {}, () => lib.info('hola'));
    check('salta el registro sin API key y usa el siguiente', () => env.requests[0].headers['x-api-key'] === 'mclog_segunda');
}
{
    const { lib, env } = createSandbox({ rows: [] });
    let threw = false;
    try {
        runEntryPoint(lib, 'execute', {}, () => lib.info('hola'));
    } catch (e) {
        threw = true;
    }
    check('sin registro no envía nada', () => env.requests.length === 0);
    check('sin registro no rompe el script', () => !threw);
    check('sin registro lo avisa en el Execution Log', () => env.nsLogs.some((l) => l.title === 'MCLog desactivado'));
}
{
    const { lib, env } = createSandbox({ rows: [{ ...DEFAULT_ROW, url: 'http://mclog.example.com' }] });
    runEntryPoint(lib, 'execute', {}, () => lib.info('hola'));
    check('una URL http:// se rechaza: la clave no viaja sin TLS', () => env.requests.length === 0);
    check('el rechazo de http:// se explica en el Execution Log', () => env.nsLogs.some((l) => l.details.includes('https://')));
}
{
    const { lib, env } = createSandbox({ queryError: { name: 'SSS_INVALID_SRCH_QUERY', message: 'Sin permiso' } });
    let threw = false;
    try {
        runEntryPoint(lib, 'execute', {}, () => lib.info('hola'));
    } catch (e) {
        threw = true;
    }
    check('si SuiteQL falla no rompe el script', () => !threw && env.requests.length === 0);
    check('si SuiteQL falla lo anota', () => env.nsLogs.some((l) => l.title === 'MCLog: no se pudo leer la configuración'));

    runEntryPoint(lib, 'execute', {}, () => lib.info('otra vez'));
    check('tras un fallo no reintenta en cada invocación', () => env.queries.length === 1, env.queries.length);

    const realNow = Date.now;
    Date.now = () => realNow() + 61 * 1000;
    try {
        env.queryError = null;
        runEntryPoint(lib, 'execute', {}, () => lib.info('ya con permiso'));
    } finally {
        Date.now = realNow;
    }
    check('reintenta la lectura al cabo de un minuto', () => env.queries.length === 2 && env.requests.length === 1, env.queries.length);
}
{
    const { lib, env } = createSandbox();
    runEntryPoint(lib, 'execute', {}, () => lib.info('uno'));
    runEntryPoint(lib, 'execute', {}, () => lib.info('dos'));
    check('la configuración se lee una sola vez y se reutiliza', () => env.queries.length === 1, env.queries.length);
}
{
    const { lib, env } = createSandbox();
    runEntryPoint(lib, 'execute', {}, () => {});
    check('sin logs no se lee la configuración ni se envía nada', () => env.queries.length === 0 && env.requests.length === 0);
}

const environmentFor = (value, envType) => {
    const { lib, env } = createSandbox({ rows: [{ ...DEFAULT_ROW, environment: value }], envType });
    runEntryPoint(lib, 'execute', {}, () => lib.info('hola'));
    return env.requests[0].body.logs[0].environment;
};
check('"sandbox" se normaliza a staging', () => environmentFor('sandbox') === 'staging');
check('"DEV" se normaliza a development', () => environmentFor('DEV') === 'development');
check('vacío en una cuenta sandbox se deduce staging', () => environmentFor('', 'SANDBOX') === 'staging');
check('vacío en una cuenta de producción se deduce production', () => environmentFor(null, 'PRODUCTION') === 'production');
check('un valor desconocido cae en el tipo de cuenta', () => environmentFor('lo-que-sea', 'SANDBOX') === 'staging');

{
    const { lib, env } = createSandbox({ rows: [{ ...DEFAULT_ROW, application: '' }] });
    runEntryPoint(lib, 'execute', {}, () => lib.info('hola'));
    check('application vacía usa la de por defecto', () => env.requests[0].body.logs[0].application === DEFAULT_APPLICATION);
}
{
    const { lib, env } = createSandbox({ rows: [{ ...DEFAULT_ROW, application: 'A'.repeat(300) }] });
    runEntryPoint(lib, 'execute', {}, () => lib.info('hola'));
    check('application larga se recorta al tope del servidor', () => env.requests[0].body.logs[0].application.length === 120);
}

group('Envío en lote por ejecución');
{
    const { lib, env } = createSandbox();
    runEntryPoint(lib, 'execute', { type: 'SCHEDULED' }, () => {
        lib.info('uno');
        lib.warn('dos');
        lib.error('tres');
    });
    const logs = sentLogs(env);
    check('tres logs salen en una sola petición', () => env.requests.length === 1 && logs.length === 3, env.requests.length);
    check('cada log conserva su nivel', () => logs.map((l) => l.level).join(',') === 'info,warn,error');
    check('timestamp ISO del momento del log', () => logs.every((l) => !isNaN(Date.parse(l.timestamp)) && l.timestamp.endsWith('Z')));
    check('service es el scriptId', () => logs[0].service === 'customscript_test');
    check('host derivado de la cuenta', () => logs[0].host === 'netsuite-TSTACCT');
    check('el contexto de NetSuite viaja en metadata', () =>
        logs[0].metadata.deploymentId === 'customdeploy_test' && logs[0].metadata.remainingUsage === 1000 && logs[0].metadata.userRole === '3');
    check('metadata lleva el punto de entrada', () => logs[0].metadata.entryPoint === 'execute');
    check('metadata lleva el tipo de invocación', () => logs[0].metadata.invocationType === 'SCHEDULED');
    check('todos comparten executionId y traceId', () =>
        new Set(logs.map((l) => l.metadata.executionId)).size === 1 && logs[0].traceId === `exec-${logs[0].metadata.executionId}`);
}
{
    const { lib, env } = createSandbox();
    const entry = lib.wrapEntryPoints({ execute: () => lib.info('hola') }).execute;
    entry({});
    entry({});
    const logs = sentLogs(env);
    check('cada invocación envía lo suyo y empieza de cero', () => env.requests.length === 2 && env.requests.every((r) => r.body.logs.length === 1));
    check('cada invocación tiene su propio executionId', () => logs[0].metadata.executionId !== logs[1].metadata.executionId);
}
if (SKIP_DEBUG_IN_PRODUCTION) {
    {
        const { lib, env } = createSandbox();
        runEntryPoint(lib, 'execute', {}, () => {
            lib.debug('detalle');
            lib.info('importante');
        });
        check('debug no sale de producción', () => sentLogs(env).map((l) => l.level).join(',') === 'info');
    }
    {
        const { lib, env } = createSandbox();
        runEntryPoint(lib, 'execute', {}, () => lib.debug('detalle'));
        check('solo debug en producción no gasta un post', () => env.requests.length === 0);
    }
} else {
    const { lib, env } = createSandbox();
    runEntryPoint(lib, 'execute', {}, () => lib.debug('detalle'));
    check('con SKIP_DEBUG_IN_PRODUCTION = false, debug sale de producción', () => sentLogs(env).length === 1);
}
{
    const { lib, env } = createSandbox({ rows: [{ ...DEFAULT_ROW, environment: 'staging' }] });
    runEntryPoint(lib, 'execute', {}, () => lib.debug('detalle'));
    check('debug sí sale de staging', () => sentLogs(env).length === 1);
}
{
    const { lib, env } = createSandbox();
    lib.info('sin envoltorio');
    check('sin envoltorio no se envía hasta flush()', () => env.requests.length === 0);
    check('flush() devuelve true si todo salió', () => lib.flush() === true && env.requests.length === 1);
    check('flush() sin nada pendiente no gasta un post', () => lib.flush() === true && env.requests.length === 1);
}

group('User Event: contexto del registro');
{
    const { lib, env } = createSandbox();
    runEntryPoint(lib, 'afterSubmit', { type: 'create', newRecord: { type: 'invoice', id: 7 } }, () => lib.info('guardada'));
    const log = sentLogs(env)[0];
    check('traceId es "<tipo>:<id>"', () => log.traceId === 'invoice:7', log && log.traceId);
    check('metadata lleva recordType, recordId y eventType', () =>
        log.metadata.recordType === 'invoice' && log.metadata.recordId === '7' && log.metadata.eventType === 'create');
}
{
    const { lib, env } = createSandbox();
    runEntryPoint(lib, 'beforeSubmit', { type: 'create', newRecord: { type: 'invoice', id: null } }, () => lib.info('nueva'));
    const log = sentLogs(env)[0];
    check('sin id aún, traceId de ejecución y recordType en metadata', () => log.traceId.startsWith('exec-') && log.metadata.recordType === 'invoice');
}
{
    const { lib, env } = createSandbox();
    runEntryPoint(lib, 'each', { type: 'customer', id: 99 }, () => lib.info('actualizado'));
    check('Mass Update: traceId del registro procesado', () => sentLogs(env)[0].traceId === 'customer:99');
}

group('Excepciones');
{
    const { lib, env } = createSandbox();
    runEntryPoint(lib, 'execute', {}, () => lib.exception('Error enviando la factura', suiteScriptError(), { invoiceId: 5 }));
    const log = sentLogs(env)[0];
    check('exception registra nivel error', () => log.level === 'error');
    check('el mensaje añade el de la excepción', () => log.message === 'Error enviando la factura: Valor no válido para el campo entity', log && log.message);
    check('errorName es el código estable de NetSuite', () => log.errorName === 'INVALID_FLD_VALUE');
    check('el stack en array se une en una cadena', () => log.errorStack === 'createError(N/error)\nafterSubmit(/SuiteScripts/ue_factura.js:42)');
    check('el id volátil NO se usa para agrupar', () => log.errorCode === undefined);
    check('el id volátil se guarda en metadata', () => log.metadata.netsuiteErrorId === 'jwjzi2kd1rqw1t8wqtwh6');
    check('la metadata de la llamada llega', () => log.metadata.invoiceId === 5);
}
{
    const { lib, env } = createSandbox();
    const failure = suiteScriptError();
    let caught;
    try {
        runEntryPoint(lib, 'afterSubmit', { newRecord: { type: 'invoice', id: 1 } }, () => {
            throw failure;
        });
    } catch (e) {
        caught = e;
    }
    const logs = sentLogs(env);
    check('una excepción no controlada se relanza intacta', () => caught === failure);
    check('y se registra sola', () => logs.length === 1 && logs[0].message.startsWith('Error no controlado en afterSubmit'), logs[0] && logs[0].message);
}
{
    const { lib, env } = createSandbox();
    const failure = suiteScriptError();
    try {
        runEntryPoint(lib, 'afterSubmit', {}, () => {
            try {
                throw failure;
            } catch (e) {
                lib.exception('Fallo al facturar', e);
                throw e;
            }
        });
    } catch (e) {
        // esperado
    }
    check('registrada a mano y relanzada, cuenta una sola vez', () => sentLogs(env).length === 1 && sentLogs(env)[0].message.startsWith('Fallo al facturar'));
}
{
    const { lib, env } = createSandbox();
    try {
        runEntryPoint(lib, 'execute', {}, () => {
            throw 'texto lanzado a pelo';
        });
    } catch (e) {
        // esperado
    }
    check('un string lanzado también se registra', () => sentLogs(env)[0].message === 'Error no controlado en execute: texto lanzado a pelo');
}
{
    const { lib, env } = createSandbox();
    runEntryPoint(lib, 'execute', {}, () => lib.warn('Validación: falta el RNC', { entity: 12 }, new Error('RNC vacío')));
    const log = sentLogs(env)[0];
    check('un warn con error conserva su nivel y su clase', () => log.level === 'warn' && log.errorName === 'Error');
}
{
    const { lib } = createSandbox();
    check('errorFields tolera null', () => JSON.stringify(lib.errorFields(null)) === '{}');
    check('errorFields convierte un code numérico', () => lib.errorFields({ code: 500 }).errorCode === '500');
    check('errorFields acepta el stack como cadena', () => lib.errorFields({ stack: 'a\nb' }).errorStack === 'a\nb');
}

group('Metadata saneada');
{
    const { lib, env } = createSandbox();
    const circular = { name: 'ciclo' };
    circular.self = circular;
    runEntryPoint(lib, 'execute', {}, () =>
        lib.info('datos', {
            customer: { password: 'x', apiKey: 'y', nested: { accessToken: 'z', Authorization: 'Bearer w' } },
            longText: 'x'.repeat(40000),
            lines: Array.from({ length: 80 }, (_, i) => i),
            deep: { a: { b: { c: { d: { e: { f: 'hondo' } } } } } },
            callback: () => 'código',
            cause: new TypeError('boom'),
            when: new Date('2026-09-25T10:00:00Z'),
            invalidDate: new Date('no-es-fecha'),
            record: { toJSON: () => ({ id: 3, type: 'invoice' }) },
            circular,
            wide: Object.fromEntries(Array.from({ length: 120 }, (_, i) => [`k${i}`, i])),
        })
    );
    const meta = sentLogs(env)[0].metadata;
    check('las claves sensibles se ocultan', () => meta.customer.password === '[REDACTED]' && meta.customer.apiKey === '[REDACTED]');
    check('también anidadas y sin distinguir mayúsculas', () =>
        meta.customer.nested.accessToken === '[REDACTED]' && meta.customer.nested.Authorization === '[REDACTED]');
    check('los textos largos se recortan con elipsis', () => meta.longText.length === 30000 && meta.longText.endsWith('…'));
    check('los arrays se acotan a 50', () => meta.lines.length === 50);
    check('la profundidad se corta', () => JSON.stringify(meta.deep).includes('[...]'));
    check('una función no vuelca su código', () => meta.callback === '[Function]');
    check('un Error se reduce a nombre y mensaje', () => meta.cause.name === 'TypeError' && meta.cause.message === 'boom');
    check('una fecha sale en ISO', () => meta.when === '2026-09-25T10:00:00.000Z');
    check('una fecha inválida no revienta', () => meta.invalidDate === 'Invalid Date');
    check('un objeto con toJSON usa su serialización', () => meta.record.id === 3 && meta.record.type === 'invoice');
    check('un ciclo no revienta', () => meta.circular.name === 'ciclo');
    check('un objeto enorme se acota y dice cuántas claves omitió', () =>
        Object.keys(meta.wide).length === 101 && meta.wide.mclogOmittedKeys === 20);
}
{
    const { lib, env } = createSandbox();
    runEntryPoint(lib, 'execute', {}, () => lib.info('texto suelto', 'no es un objeto'));
    check('una metadata que no es objeto va en details', () => sentLogs(env)[0].metadata.details === 'no es un objeto');
}
{
    const { lib, env } = createSandbox();
    runEntryPoint(lib, 'execute', {}, () => {
        lib.info(undefined);
        lib.setContext(null);
        lib.info('😀'.repeat(15000));
    });
    const logs = sentLogs(env);
    check('un log sin mensaje no deja el campo vacío', () => logs[0].message === 'Log sin mensaje');
    check('el recorte no parte un emoji', () => !/[\ud800-\udbff]…$/.test(logs[1].message) && logs[1].message.length <= 20000);
}

group('Documentos (traceId)');
{
    const { lib, env } = createSandbox();
    runEntryPoint(lib, 'execute', {}, () => {
        lib.setContext({ batchId: 'LOTE-17' });
        lib.setDocument('salesorder', 10);
        lib.info('con documento');
        lib.clearDocument();
        lib.info('sin documento');
        lib.setDocument('salesorder', '');
        lib.info('id vacío no cambia nada');
    });
    const logs = sentLogs(env);
    check('setDocument fija el traceId', () => logs[0].traceId === 'salesorder:10' && logs[0].metadata.recordId === '10');
    check('clearDocument vuelve al traceId de ejecución', () => logs[1].traceId.startsWith('exec-') && logs[1].metadata.recordId === undefined);
    check('setDocument sin id no cambia nada', () => logs[2].traceId.startsWith('exec-'));
    check('setContext se aplica a todos los logs siguientes', () => logs.every((l) => l.metadata.batchId === 'LOTE-17'));
}
{
    const { lib, env } = createSandbox();
    let thrown;
    runEntryPoint(lib, 'afterSubmit', { newRecord: { type: 'invoice', id: 1 } }, () => {
        const result = lib.withDocument('customer', 20, () => {
            lib.info('dentro');
            return 'resultado';
        });
        try {
            lib.withDocument('customer', 21, () => {
                throw new Error('fallo dentro');
            });
        } catch (e) {
            thrown = e;
        }
        lib.info(`fuera: ${result}`);
    });
    const logs = sentLogs(env);
    check('withDocument asocia los logs de dentro', () => logs[0].traceId === 'customer:20');
    check('withDocument devuelve lo que devuelve fn', () => logs[1].message === 'fuera: resultado');
    check('withDocument vuelve al documento anterior', () => logs[1].traceId === 'invoice:1', logs[1] && logs[1].traceId);
    check('withDocument relanza lo que falle dentro', () => thrown && thrown.message === 'fallo dentro');
}

group('Governance');
{
    const { lib, env } = createSandbox({ remainingUsage: 15 });
    runEntryPoint(lib, 'execute', {}, () => lib.info('hola'));
    check('sin governance no envía', () => env.requests.length === 0);
    check('sin governance lo anota', () => env.nsLogs.some((l) => l.title === 'MCLog: sin governance para enviar'));
}
{
    const { lib, env } = createSandbox();
    let requestsBeforeEnd;
    runEntryPoint(lib, 'execute', {}, () => {
        for (let i = 0; i < 200; i++) lib.info(`log ${i}`);
        requestsBeforeEnd = env.requests.length;
    });
    check('con 200 en memoria y governance de sobra, envía sin esperar', () => requestsBeforeEnd === 1, requestsBeforeEnd);
}
{
    const { lib, env } = createSandbox({ remainingUsage: 150 });
    runEntryPoint(lib, 'execute', {}, () => {
        for (let i = 0; i < 600; i++) lib.info(`log ${i}`);
    });
    check('con poca governance acumula y trocea al final (500 + 100)', () =>
        env.requests.map((r) => r.body.logs.length).join(',') === '500,100', env.requests.map((r) => r.body.logs.length).join(','));
}
{
    const { lib, env } = createSandbox({ remainingUsage: 150 });
    runEntryPoint(lib, 'execute', {}, () => {
        for (let i = 0; i < 1005; i++) lib.info(`log ${i}`);
    });
    const logs = sentLogs(env);
    check('el tope de memoria descarta el exceso', () => logs.length === 1001, logs.length);
    check('y avisa de cuántos se perdieron', () => logs[1000].level === 'warn' && logs[1000].message.includes('5 logs'));
}

group('Troceo por bytes');
{
    const { lib, env } = createSandbox({ remainingUsage: 150 });
    runEntryPoint(lib, 'execute', {}, () => {
        for (let i = 0; i < 120; i++) lib.info(`${i} ${'x'.repeat(19990)}`);
    });
    const logs = sentLogs(env);
    check('2,4 MB se parten en varias peticiones', () => env.requests.length > 1, env.requests.length);
    check('ningún cuerpo pasa de 1 MB', () => env.requests.every((r) => r.bytes <= 1024 * 1024), env.requests.map((r) => r.bytes).join(', '));
    check('no se pierde ni se desordena ninguna entrada', () =>
        logs.length === 120 && logs.every((l, i) => l.message.startsWith(`${i} `)));
}

group('Fallos del servicio');
{
    const { lib, env } = createSandbox({ response: { code: 401, body: '{"error":"Invalid API key"}' } });
    lib.info('hola');
    check('una respuesta 401 devuelve false sin lanzar', () => lib.flush() === false);
    check('el Execution Log explica el 401', () => env.nsLogs.some((l) => l.details.includes('HTTP 401 (API key incorrecta')));
}
{
    const { lib, env } = createSandbox({ networkError: { name: 'SSS_CONNECTION_TIME_OUT', message: 'timeout' } });
    let threw = false;
    try {
        runEntryPoint(lib, 'execute', {}, () => lib.info('hola'));
    } catch (e) {
        threw = true;
    }
    check('un error de red no rompe el script', () => !threw);
    check('un error de red se anota', () => env.nsLogs.some((l) => l.title === 'MCLog: error de red' && l.details.includes('SSS_CONNECTION_TIME_OUT')));
    check('la API key nunca aparece en el Execution Log', () => env.nsLogs.every((l) => !l.details.includes('mclog_test_key')));
}

group('Map/Reduce');
{
    const { lib, env } = createSandbox();
    runEntryPoint(lib, 'map', { key: '123', value: '{}' }, () => lib.info('procesando'));
    check('map anota la clave en metadata', () => sentLogs(env)[0].metadata.key === '123');
}
{
    const { lib, env } = createSandbox();
    const errors = { '10': '{"name":"RCRD_DSNT_EXIST"}', '11': '{"name":"INVALID_FLD_VALUE"}' };
    const stage = (map) => ({
        errors: {
            iterator: () => ({
                each: (callback) => Object.keys(map).forEach((key) => callback(key, map[key])),
            }),
        },
    });
    runEntryPoint(
        lib,
        'summarize',
        { usage: 900, concurrency: 2, yields: 0, seconds: 30, inputSummary: {}, mapSummary: stage(errors), reduceSummary: stage({}) },
        () => {}
    );
    const log = sentLogs(env)[0];
    check('summarize añade un resumen solo', () => log && log.message === 'Map/Reduce finalizado con errores', log && log.message);
    check('el resumen con errores sale en warn', () => log.level === 'warn');
    check('cuenta los errores de cada etapa', () => log.metadata.mapErrors === 2 && log.metadata.reduceErrors === 0);
    check('adjunta una muestra con la clave', () => log.metadata.errorSamples.length === 2 && log.metadata.errorSamples[0].key === '10');
}
{
    const { lib, env } = createSandbox();
    runEntryPoint(lib, 'summarize', { usage: 10, inputSummary: {}, mapSummary: null, reduceSummary: null }, () => {});
    check('sin errores el resumen sale en info', () => sentLogs(env)[0].level === 'info' && sentLogs(env)[0].message === 'Map/Reduce finalizado');
}

group('Invocaciones anidadas');
{
    const { lib, env } = createSandbox();
    const inner = lib.wrapEntryPoints({ afterSubmit: () => lib.info('B') }).afterSubmit;
    runEntryPoint(lib, 'onRequest', { request: { method: 'POST' } }, () => {
        lib.setDocument('salesorder', 1);
        lib.info('A');
        inner({ newRecord: { type: 'invoice', id: 2 } });
        lib.info('C');
    });
    const bodies = env.requests.map((r) => r.body.logs.map((l) => l.message).join(''));
    check('la invocación interna envía solo lo suyo', () => bodies[0] === 'B', bodies.join(' | '));
    check('la externa conserva lo acumulado antes y después', () => bodies[1] === 'AC', bodies.join(' | '));
    check('la externa conserva su documento', () => env.requests[1].body.logs.every((l) => l.traceId === 'salesorder:1'));
    check('la externa anota el método HTTP', () => env.requests[1].body.logs[0].metadata.method === 'POST');
}

// ------------------------------------------------ puntos de entrada async

const runAsyncTests = async () => {
    group('Puntos de entrada async');
    {
        const { lib, env } = createSandbox();
        const value = await runEntryPoint(lib, 'execute', {}, async () => {
            lib.info('antes');
            await Promise.resolve();
            lib.info('después');
            return 'listo';
        });
        const logs = sentLogs(env);
        check('devuelve lo que resuelve la promesa', () => value === 'listo');
        check('lo registrado tras el await también sale', () => logs.map((l) => l.message).join(',') === 'antes,después');
        check('con el mismo executionId', () => logs[0].metadata.executionId === logs[1].metadata.executionId);
    }
    {
        const { lib, env } = createSandbox();
        const failure = new Error('rechazo');
        let caught;
        try {
            await runEntryPoint(lib, 'execute', {}, async () => {
                await Promise.resolve();
                throw failure;
            });
        } catch (e) {
            caught = e;
        }
        check('un rechazo se relanza intacto', () => caught === failure);
        check('y se registra', () => sentLogs(env).some((l) => l.message === 'Error no controlado en execute: rechazo'));
    }
};

// ------------------------------------------------------------------ cierre

runAsyncTests().then(() => {
    console.log(failures === 0 ? `\nTodo correcto (${checks} comprobaciones).` : `\n${failures} de ${checks} comprobaciones fallidas.`);
    process.exit(failures === 0 ? 0 : 1);
});
