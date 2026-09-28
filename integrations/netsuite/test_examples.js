/**
 * Pruebas de los scripts de examples/ y de lib_mclog_browser.js fuera de NetSuite.
 *
 *   node integrations/netsuite/test_examples.js
 *
 * Sin framework ni dependencias, como test_lib_mclog.js. Cada prueba carga el
 * ejemplo con la lib_mclog.js real sobre un NetSuite simulado y comprueba dos
 * cosas: que la lógica de negocio hace lo que promete la guía, y que a MCLog
 * llega lo que la guía dice que llega (nivel, mensaje, traceId, metadata).
 *
 * Lo que no cubre: el runtime real (governance de verdad, permisos, campos que
 * existan en tu cuenta, un SuiteScriptError auténtico). Pruébalos en un sandbox.
 */

const fs = require('fs');
const path = require('path');

const read = (file) => fs.readFileSync(path.join(__dirname, file), 'utf8');
const LIB_SOURCE = read('lib_mclog.js');
const BROWSER_LIB_SOURCE = read('lib_mclog_browser.js');

const MCLOG_URL = 'https://mclog.example.com';
const PROXY_URL = '/app/site/hosting/scriptlet.nl?script=101&deploy=1';

// ---------------------------------------------------------------- simulación

/** Misma forma que un SuiteScriptError: código en name, stack como array e id variable. */
class FakeSuiteScriptError {
    constructor(name, message) {
        this.name = name;
        this.message = message;
        this.id = `err-${Math.random().toString(36).slice(2, 10)}`;
        this.stack = ['createError(N/error)', `${name}(/SuiteScripts/example.js:10)`];
    }
}

/** Un registro de solo lectura, como context.newRecord. */
const fakeRecord = ({ type, id, values = {}, lines = {} }) => ({
    type,
    id,
    getValue: ({ fieldId }) => values[fieldId],
    getLineCount: ({ sublistId }) => (lines[sublistId] || []).length,
    getSublistValue: ({ sublistId, fieldId, line }) => lines[sublistId][line][fieldId],
});

const USER_EVENT_TYPE = { CREATE: 'create', EDIT: 'edit', XEDIT: 'xedit', DELETE: 'delete' };
const userEventContext = (type, newRecord) => ({ type, UserEventType: USER_EVENT_TYPE, newRecord });

/** Resultado de N/search con getValue, como los de run().getRange(). */
const searchResult = (id, values = {}) => ({ id: String(id), getValue: ({ name }) => values[name] });

/** Iterador de NetSuite: each(callback) hasta que el callback devuelva false. */
const iteratorOf = (pairs) => ({
    iterator: () => ({
        each: (callback) => {
            for (const [key, value] of pairs) if (callback(key, value) === false) break;
        },
    }),
});

/**
 * NetSuite simulado para scripts de servidor. `env` guarda lo que hicieron el
 * ejemplo y la librería, y permite cambiar lo que ven.
 */
const createServer = (overrides = {}) => {
    const env = {
        params: {},
        remainingUsage: 5000,
        envType: 'PRODUCTION',
        mclogRequests: [],
        externalRequests: [],
        externalResponse: { code: 200, body: '{"id":"PRV-1"}' },
        externalError: null,
        search: () => [],
        searches: [],
        createdRecords: [],
        saveError: null,
        nextId: 1000,
        emails: [],
        emailError: () => null,
        files: {},
        nsLogs: [],
        ...overrides,
    };

    const nsLog = (level) => (options) => env.nsLogs.push({ level, title: options.title, details: String(options.details) });

    const modules = {
        'N/https': {
            post: ({ url, body, headers }) => {
                env.remainingUsage -= 10;
                if (url.startsWith(MCLOG_URL)) {
                    env.mclogRequests.push({ url, headers, body: JSON.parse(body) });
                    return { code: 201, body: '{"status":"ok"}' };
                }
                env.externalRequests.push({ url, headers, body: JSON.parse(body) });
                if (env.externalError) throw env.externalError;
                return env.externalResponse;
            },
            createSecureString: ({ input }) => ({ secureStringInput: input }),
        },
        'N/log': { error: nsLog('error'), audit: nsLog('audit'), debug: nsLog('debug') },
        'N/runtime': {
            getCurrentScript: () => ({
                id: 'customscript_example',
                deploymentId: 'customdeploy_example',
                getRemainingUsage: () => env.remainingUsage,
                getParameter: ({ name }) => (env.params[name] === undefined ? '' : env.params[name]),
            }),
            getCurrentUser: () => ({ id: 42, role: 3 }),
            executionContext: 'USERINTERFACE',
            accountId: 'TSTACCT',
            get envType() {
                return env.envType;
            },
        },
        'N/query': {
            runSuiteQL: () => ({
                asMappedResults: () => [{ id: 1, url: MCLOG_URL, apikey: 'mclog_test_key', application: 'SuiteApp-Test', environment: '' }],
            }),
        },
        'N/cache': {
            Scope: { PRIVATE: 'PRIVATE' },
            getCache: () => {
                const store = new Map();
                return { get: ({ key, loader }) => (store.has(key) ? store.get(key) : store.set(key, loader()).get(key)) };
            },
        },
        'N/error': { create: ({ name, message }) => new FakeSuiteScriptError(name, message) },
        'N/record': {
            Type: { SALES_ORDER: 'salesorder', CUSTOMER: 'customer' },
            create: ({ type }) => {
                const created = { type, values: {}, lines: [], current: null };
                return {
                    setValue: ({ fieldId, value }) => {
                        created.values[fieldId] = value;
                    },
                    selectNewLine: () => {
                        created.current = {};
                    },
                    setCurrentSublistValue: ({ fieldId, value }) => {
                        created.current[fieldId] = value;
                    },
                    commitLine: () => {
                        created.lines.push(created.current);
                        created.current = null;
                    },
                    save: () => {
                        if (env.saveError) throw env.saveError;
                        created.id = env.nextId++;
                        env.createdRecords.push(created);
                        return created.id;
                    },
                };
            },
        },
        'N/search': {
            Type: { SALES_ORDER: 'salesorder', CUSTOMER: 'customer', INVOICE: 'invoice' },
            create: (options) => {
                env.searches.push(options);
                return { run: () => ({ getRange: ({ start, end }) => env.search(options).slice(start, end) }) };
            },
        },
        'N/email': {
            send: (options) => {
                env.remainingUsage -= 20;
                const failure = env.emailError(options);
                if (failure) throw failure;
                env.emails.push(options);
            },
        },
        'N/file': {
            load: ({ id }) => {
                if (env.files[id] === undefined) throw new FakeSuiteScriptError('RCRD_DSNT_EXIST', `No existe el fichero ${id}`);
                return { lines: iteratorOfLines(env.files[id]) };
            },
        },
    };

    let lib;
    const resolve = (name) => {
        if (name === '/SuiteScripts/lib/lib_mclog') return lib;
        if (!modules[name]) throw new Error(`Módulo no simulado: ${name}`);
        return modules[name];
    };
    const load = (source) => {
        let exported;
        new Function('define', source)((deps, factory) => {
            exported = factory(...deps.map(resolve));
        });
        return exported;
    };
    lib = load(LIB_SOURCE);

    return { env, loadExample: (file) => load(read(path.join('examples', file))) };
};

/** file.lines de N/file: un iterador de { value } por línea. */
const iteratorOfLines = (content) => ({
    iterator: () => ({
        each: (callback) => {
            for (const value of content.split(/\r?\n/)) if (callback({ value }) === false) break;
        },
    }),
});

/**
 * NetSuite simulado para Client Scripts: N/https con promesas, N/url y
 * N/currentRecord. Expone lo que se envió al proxy.
 */
const createBrowser = (overrides = {}) => {
    const env = {
        proxyRequests: [],
        proxyFails: false,
        resolved: [],
        currentRecord: { type: 'salesorder', id: 55 },
        lookup: () => ({ creditholdoverride: [{ value: 'AUTO', text: 'Auto' }] }),
        alerts: [],
        ...overrides,
    };

    const modules = {
        'N/https': {
            post: {
                promise: ({ url, body, headers }) => {
                    env.proxyRequests.push({ url, headers, body: JSON.parse(body), rawBody: body });
                    return env.proxyFails ? Promise.reject(new Error('Failed to fetch')) : Promise.resolve({ code: 200, body: '{"ok":true}' });
                },
            },
        },
        'N/url': {
            resolveScript: (options) => {
                env.resolved.push(options);
                return PROXY_URL;
            },
        },
        'N/runtime': { getCurrentScript: () => ({ id: 'customscript_mcl_so_form' }) },
        'N/currentRecord': { get: () => env.currentRecord },
        'N/search': {
            Type: { CUSTOMER: 'customer' },
            lookupFields: (options) => env.lookup(options),
        },
        'N/ui/dialog': { alert: (options) => env.alerts.push(options) },
    };

    let browserLib;
    const resolve = (name) => {
        if (name === '/SuiteScripts/lib/lib_mclog_browser') return browserLib;
        if (!modules[name]) throw new Error(`Módulo no simulado: ${name}`);
        return modules[name];
    };
    const load = (source) => {
        let exported;
        new Function('define', source)((deps, factory) => {
            exported = factory(...deps.map(resolve));
        });
        return exported;
    };
    browserLib = load(BROWSER_LIB_SOURCE);

    return { env, browserLib, loadExample: (file) => load(read(path.join('examples', file))) };
};

/** Todas las entradas enviadas a MCLog, en orden, sin importar en cuántas peticiones. */
const sentLogs = (env) => env.mclogRequests.flatMap((request) => request.body.logs);

/** Contexto de un Suitelet con la respuesta capturada. */
const suiteletContext = ({ method = 'POST', headers = { 'X-MCLog-Client': '1' }, body = '' } = {}) => {
    const response = {
        headers: {},
        output: '',
        setHeader: ({ name, value }) => {
            response.headers[name] = value;
        },
        write: ({ output }) => {
            response.output += output;
        },
    };
    return { request: { method, headers, body }, response, reply: () => JSON.parse(response.output) };
};

/** Resumen de un Map/Reduce con lo que escribieron los map. */
const mapReduceSummary = (outputs, mapErrors = []) => ({
    inputSummary: {},
    mapSummary: { errors: iteratorOf(mapErrors) },
    reduceSummary: { errors: iteratorOf([]) },
    output: iteratorOf(outputs.map((o) => [o.key, o.value])),
    usage: 120,
    concurrency: 1,
    yields: 0,
    seconds: 3,
});

const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

// ------------------------------------------------------------------ útiles

let failures = 0;
let checks = 0;

/** `condition` va como función: si revienta, cuenta como fallo y deja correr las demás. */
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

const captureThrow = (fn) => {
    try {
        fn();
        return undefined;
    } catch (e) {
        return e;
    }
};

// ------------------------------------------------------------------ receta 1

group('Receta 1 — ue_invoice_send_to_provider');
{
    const invoice = () => fakeRecord({
        type: 'invoice',
        id: 77,
        values: { tranid: 'INV-77', entity: 12, currency: 1, total: 150 },
        lines: { item: [{ item: 5, quantity: 1, rate: 100, amount: 100 }, { item: 6, quantity: 2, rate: 25, amount: 50 }] },
    });
    const configured = {
        custscript_mcl_prov_url: 'https://proveedor.example.com/api/invoices?tenant=acme',
        custscript_mcl_prov_secret: 'custsecret_proveedor_token',
    };

    {
        const { env, loadExample } = createServer({ params: configured });
        loadExample('ue_invoice_send_to_provider.js').afterSubmit(userEventContext('create', invoice()));
        const call = env.externalRequests[0];
        const [log] = sentLogs(env);
        check('envía la factura al endpoint configurado', () => call.url === configured.custscript_mcl_prov_url);
        check('con sus líneas y su total', () => call.body.invoiceId === 77 && call.body.lines.length === 2 && call.body.total === 150);
        check('el token sale de un API Secret, no del código', () => call.headers['x-api-key'].secureStringInput === '{custsecret_proveedor_token}');
        check('registra info "Factura enviada al proveedor"', () => log.level === 'info' && log.message === 'Factura enviada al proveedor', log && log.message);
        check('con el traceId de la factura', () => log.traceId === 'invoice:77');
        check('con código HTTP, duración e id del proveedor', () =>
            log.metadata.httpStatus === 200 && typeof log.metadata.durationMs === 'number' && log.metadata.providerId === 'PRV-1');
        check('el endpoint va sin query string', () => log.metadata.endpoint === 'https://proveedor.example.com/api/invoices');
        check('no registra el cuerpo enviado ni el secreto', () =>
            typeof log.metadata.lines === 'number' && !JSON.stringify(log).includes('custsecret'));
        check('todo sale en una sola petición a MCLog', () => env.mclogRequests.length === 1);
    }
    {
        const { env, loadExample } = createServer({ params: configured, externalResponse: { code: 422, body: 'x'.repeat(3000) } });
        loadExample('ue_invoice_send_to_provider.js').afterSubmit(userEventContext('edit', invoice()));
        const [log] = sentLogs(env);
        check('un rechazo del proveedor es error', () => log.level === 'error' && log.message === 'El proveedor rechazó la factura');
        check('con su código HTTP', () => log.metadata.httpStatus === 422);
        check('y su respuesta recortada a 1000 caracteres', () => log.metadata.providerResponse.length === 1000);
    }
    {
        const failure = new FakeSuiteScriptError('SSS_REQUEST_TIME_EXCEEDED', 'Tiempo de espera agotado');
        const { env, loadExample } = createServer({ params: configured, externalError: failure });
        const thrown = captureThrow(() => loadExample('ue_invoice_send_to_provider.js').afterSubmit(userEventContext('create', invoice())));
        const [log] = sentLogs(env);
        check('un fallo de red no rompe el guardado', () => thrown === undefined);
        check('se registra como excepción agrupable', () =>
            log.level === 'error' && log.errorName === 'SSS_REQUEST_TIME_EXCEEDED' &&
            log.message === 'No se pudo conectar con el proveedor: Tiempo de espera agotado', log && log.message);
        check('solo una vez (no hay "Error no controlado")', () => sentLogs(env).length === 1);
    }
    {
        const { env, loadExample } = createServer();
        loadExample('ue_invoice_send_to_provider.js').afterSubmit(userEventContext('create', invoice()));
        const [log] = sentLogs(env);
        check('sin parámetros avisa con warn y no llama al proveedor', () =>
            log.level === 'warn' && log.message === 'Envío al proveedor sin configurar' && env.externalRequests.length === 0);
        check('y dice qué parámetros faltan', () => log.metadata.missing.join(',') === 'custscript_mcl_prov_url,custscript_mcl_prov_secret');
    }
    {
        const { env, loadExample } = createServer({ params: configured });
        const script = loadExample('ue_invoice_send_to_provider.js');
        script.afterSubmit(userEventContext('xedit', invoice()));
        script.afterSubmit(userEventContext('delete', invoice()));
        check('una edición en línea o un borrado no envían nada', () => env.externalRequests.length === 0 && env.mclogRequests.length === 0);
    }
}

// ------------------------------------------------------------------ receta 2

group('Receta 2 — rl_order_intake');
{
    const order = { externalId: ' WEB-1001 ', customerId: 12, lines: [{ itemId: 5, quantity: 2, rate: 10.5 }, { itemId: 6, quantity: 1 }] };

    {
        const { env, loadExample } = createServer();
        const result = loadExample('rl_order_intake.js').post({ externalId: '', customerId: 'x', lines: [] });
        const [log] = sentLogs(env);
        check('un pedido inválido devuelve ok: false con cada problema', () =>
            result.ok === false && result.errors.map((e) => e.field).join(',') === 'externalId,customerId,lines');
        check('registra warn con los problemas', () => log.level === 'warn' && log.message === 'Pedido rechazado por datos inválidos' && log.metadata.problems.length === 3);
        check('sin externalId queda en la traza de la ejecución', () => log.traceId.startsWith('exec-'));
        check('y no crea nada', () => env.createdRecords.length === 0);
    }
    {
        const { env, loadExample } = createServer();
        loadExample('rl_order_intake.js').post({ externalId: 'WEB-7', customerId: 0, lines: [] });
        check('un rechazo con externalId ya es buscable por él', () => sentLogs(env)[0].traceId === 'weborder:WEB-7');
    }
    {
        const { env, loadExample } = createServer();
        const result = loadExample('rl_order_intake.js').post({ externalId: 'WEB-9', customerId: 1, lines: [{ itemId: 0, quantity: -1, rate: 'x' }] });
        check('valida cada línea', () => result.errors.map((e) => e.field).join(',') === 'lines[0].itemId,lines[0].quantity,lines[0].rate');
        check('un cuerpo que no es JSON se rechaza', () => {
            const text = createServer().loadExample('rl_order_intake.js').post('texto');
            return text.ok === false && text.errors[0].message === 'El cuerpo debe ser un objeto JSON';
        });
        check('sin tocar registros', () => env.createdRecords.length === 0);
    }
    {
        const { env, loadExample } = createServer();
        const result = loadExample('rl_order_intake.js').post(order);
        const created = env.createdRecords[0];
        const [log] = sentLogs(env);
        check('crea la orden de venta con cliente, externalid y líneas', () =>
            created.type === 'salesorder' && created.values.entity === 12 && created.values.externalid === 'WEB-1001' && created.lines.length === 2);
        check('una línea sin precio no fija rate (usa el de NetSuite)', () => created.lines[1].rate === undefined);
        check('devuelve el id', () => result.ok === true && result.id === 1000);
        check('registra info con el traceId del número del e-commerce', () =>
            log.message === 'Pedido creado desde el e-commerce' && log.traceId === 'weborder:WEB-1001', log && log.traceId);
        check('con la orden creada y el canal en metadata', () => log.metadata.salesOrderId === 1000 && log.metadata.channel === 'ecommerce');
        check('busca duplicados por externalid', () => JSON.stringify(env.searches[0].filters[0]) === '["externalid","anyof","WEB-1001"]');
    }
    {
        const { env, loadExample } = createServer({ search: () => [searchResult(555)] });
        const result = loadExample('rl_order_intake.js').post(order);
        const [log] = sentLogs(env);
        check('un reintento devuelve el pedido existente', () => result.ok === true && result.id === '555' && result.duplicate === true);
        check('sin crear otro', () => env.createdRecords.length === 0);
        check('y lo registra en la misma traza que el primer intento', () =>
            log.message === 'Pedido duplicado: se devuelve el existente' && log.traceId === 'weborder:WEB-1001' && log.metadata.salesOrderId === '555');
    }
    {
        const failure = new FakeSuiteScriptError('INVALID_KEY_OR_REF', 'Valor no válido 999 para el campo item');
        const { env, loadExample } = createServer({ saveError: failure });
        const result = loadExample('rl_order_intake.js').post(order);
        const [log] = sentLogs(env);
        check('un fallo de NetSuite devuelve solo su código', () =>
            result.ok === false && result.errors[0].code === 'INVALID_KEY_OR_REF' && !JSON.stringify(result).includes('999'));
        check('el detalle queda en MCLog, agrupable y en la traza del pedido', () =>
            log.level === 'error' && log.errorName === 'INVALID_KEY_OR_REF' && log.traceId === 'weborder:WEB-1001');
        check('con el id de NetSuite para cruzarlo', () => log.metadata.netsuiteErrorId === failure.id);
    }
}

// ------------------------------------------------------------------ receta 3

group('Receta 3 — ue_sales_order_rules');
{
    const salesOrder = (values, quantities = [1]) => fakeRecord({
        type: 'salesorder',
        id: 9,
        values,
        lines: { item: quantities.map((quantity) => ({ quantity })) },
    });

    {
        const { env, loadExample } = createServer();
        const thrown = captureThrow(() => loadExample('ue_sales_order_rules.js').beforeSubmit(userEventContext('create', salesOrder({ total: 20000, otherrefnum: '' }))));
        const logs = sentLogs(env);
        check('bloquea el guardado con el código de la regla', () => thrown && thrown.name === 'MC_PO_REQUIRED', thrown && thrown.name);
        check('con un mensaje para el usuario', () => thrown.message === 'Los pedidos desde 10000 necesitan número de orden de compra (OC).');
        check('registra warn, no error', () => logs[0].level === 'warn' && logs[0].message.startsWith('Pedido bloqueado por una regla de negocio'));
        check('con el código para agrupar y los datos de la regla', () =>
            logs[0].errorName === 'MC_PO_REQUIRED' && logs[0].metadata.rule === 'MC_PO_REQUIRED' && logs[0].metadata.total === 20000);
        check('una sola vez: el relanzamiento no se registra como no controlado', () => logs.length === 1);
    }
    {
        const { env, loadExample } = createServer();
        const thrown = captureThrow(() => loadExample('ue_sales_order_rules.js').beforeSubmit(userEventContext('edit', salesOrder({ total: 20000, otherrefnum: 'OC-1' }, [10, 600]))));
        const [log] = sentLogs(env);
        check('la segunda regla salta si la primera se cumple', () => thrown.name === 'MC_LINE_QUANTITY_LIMIT');
        check('y dice qué línea la rompe', () => log.metadata.line === 2 && log.metadata.quantity === 600);
    }
    {
        const { env, loadExample } = createServer({ params: { custscript_mcl_rules_po_from: 50000 } });
        const thrown = captureThrow(() => loadExample('ue_sales_order_rules.js').beforeSubmit(userEventContext('create', salesOrder({ total: 20000, otherrefnum: '' }))));
        check('los parámetros del deployment cambian el límite', () => thrown === undefined);
        check('un pedido correcto no envía nada', () => env.mclogRequests.length === 0);
    }
    {
        const { env, loadExample } = createServer();
        const thrown = captureThrow(() => loadExample('ue_sales_order_rules.js').beforeSubmit(userEventContext('xedit', salesOrder({ total: 20000 }))));
        check('una edición en línea no se valida', () => thrown === undefined && env.mclogRequests.length === 0);
    }
}

// ------------------------------------------------------------------ receta 4

group('Receta 4 — wa_approval_route');
{
    const context = (total) => ({ newRecord: fakeRecord({ type: 'salesorder', id: 9, values: { total } }), workflowId: 3 });

    {
        const { env, loadExample } = createServer({ params: { custscript_mcl_wa_limit: 50000 } });
        const result = loadExample('wa_approval_route.js').onAction(context(80000));
        const [log] = sentLogs(env);
        check('por encima del límite devuelve T', () => result === 'T');
        check('y lo registra con el traceId del documento', () =>
            log.message === 'Documento enviado a aprobación de dirección' && log.traceId === 'salesorder:9' && log.metadata.workflowId === 3);
    }
    {
        const { env, loadExample } = createServer({ params: { custscript_mcl_wa_limit: 50000 } });
        const result = loadExample('wa_approval_route.js').onAction(context(100));
        check('por debajo devuelve F', () => result === 'F');
        check('y en producción no envía nada (es debug)', () => env.mclogRequests.length === 0);
    }
    {
        const { env, loadExample } = createServer({ params: { custscript_mcl_wa_limit: 50000 }, envType: 'SANDBOX' });
        loadExample('wa_approval_route.js').onAction(context(100));
        check('en un sandbox el debug sí sale', () => sentLogs(env)[0].level === 'debug');
    }
    {
        const { env, loadExample } = createServer();
        const result = loadExample('wa_approval_route.js').onAction(context(60000));
        const logs = sentLogs(env);
        check('sin parámetro usa el límite por defecto', () => result === 'T');
        check('y avisa con warn', () => logs[0].level === 'warn' && logs[0].message === 'Límite de aprobación sin configurar');
    }
}

// ------------------------------------------------------------------ receta 5

group('Receta 5 — ss_overdue_invoice_reminders');
{
    const invoices = [
        searchResult(1, { tranid: 'INV-1', entity: 10, email: 'pagos@acme.com', amountremaining: 100 }),
        searchResult(2, { tranid: 'INV-2', entity: 11, email: '', amountremaining: 50 }),
        searchResult(3, { tranid: 'INV-3', entity: 12, email: 'roto@globex.com', amountremaining: 70 }),
    ];
    const params = { custscript_mcl_ss_author: 7, custscript_mcl_ss_min_days: 5 };

    {
        const { env, loadExample } = createServer({
            params,
            search: () => invoices,
            emailError: (options) => (options.recipients[0] === 'roto@globex.com' ? new FakeSuiteScriptError('SSS_INVALID_EMAIL', 'Correo rechazado') : null),
        });
        loadExample('ss_overdue_invoice_reminders.js').execute({ type: 'SCHEDULED' });
        const logs = sentLogs(env);
        const failure = logs.find((l) => l.level === 'error');
        const summary = logs[logs.length - 1];
        check('envía el recordatorio a las facturas con correo', () => env.emails.length === 1 && env.emails[0].relatedRecords.transactionId === 1);
        check('filtra por los días de retraso del parámetro', () =>
            env.searches[0].filters.some((f) => Array.isArray(f) && f[0] === 'daysoverdue' && f[2] === 5));
        check('un fallo se registra con el traceId de su factura', () => failure.traceId === 'invoice:3' && failure.errorName === 'SSS_INVALID_EMAIL');
        check('el resumen vuelve al traceId de la ejecución', () => summary.traceId.startsWith('exec-'));
        check('y sale como warn con incidencias', () => summary.level === 'warn' && summary.message === 'Recordatorios de facturas vencidas terminados con incidencias');
        check('con los totales y la muestra sin correo', () =>
            summary.metadata.sent === 1 && summary.metadata.failed === 1 && summary.metadata.withoutEmail === 1 &&
            summary.metadata.withoutEmailSample[0] === 'INV-2');
        check('no registra un log por cada correo enviado', () => logs.length === 2);
        check('todos llevan el proceso en metadata', () => logs.every((l) => l.metadata.process === 'overdue-invoice-reminders'));
    }
    {
        const { env, loadExample } = createServer({ params, search: () => [invoices[0]] });
        loadExample('ss_overdue_invoice_reminders.js').execute({ type: 'SCHEDULED' });
        const logs = sentLogs(env);
        check('sin incidencias, un solo info de resumen', () => logs.length === 1 && logs[0].level === 'info' && logs[0].metadata.sent === 1);
    }
    {
        const many = [1, 2, 3].map((id) => searchResult(id, { tranid: `INV-${id}`, entity: 10, email: 'a@b.com' }));
        const { env, loadExample } = createServer({ params, search: () => many, remainingUsage: 130 });
        loadExample('ss_overdue_invoice_reminders.js').execute({ type: 'SCHEDULED' });
        const stop = sentLogs(env).find((l) => l.message === 'Recordatorios detenidos por governance');
        check('se detiene antes de agotar la governance', () => env.emails.length === 2);
        check('y avisa de cuántas quedan pendientes', () => stop && stop.level === 'warn' && stop.metadata.pending === 1);
        check('los logs llegan a MCLog igualmente', () => env.mclogRequests.length === 1);
    }
    {
        const { env, loadExample } = createServer({ search: () => invoices });
        loadExample('ss_overdue_invoice_reminders.js').execute({ type: 'SCHEDULED' });
        const [log] = sentLogs(env);
        check('sin remitente registra error y no busca', () =>
            log.level === 'error' && log.message === 'Recordatorios sin configurar: falta el remitente' && env.searches.length === 0);
    }
}

// ------------------------------------------------------------------ receta 6

group('Receta 6 — mr_customer_import');
{
    const CSV = [
        '﻿CompanyName;ExternalId;Email',
        '"Pérez; S.A.";C-1;ventas@perez.com',
        'Sin Id;;x@y.com',
        'ACME;C-3;no-es-correo',
        '',
        'Globex;C-4;',
    ].join('\r\n');

    /** Ejecuta las tres etapas como NetSuite y devuelve lo que escribió cada map. */
    const runImport = (script, rows) => {
        const outputs = [];
        const mapErrors = [];
        rows.forEach((row, index) => {
            const error = captureThrow(() => script.map({ key: String(index), value: JSON.stringify(row), write: (pair) => outputs.push(pair) }));
            if (error) mapErrors.push([String(index), JSON.stringify(error)]);
        });
        script.summarize(mapReduceSummary(outputs, mapErrors));
        return outputs;
    };

    {
        const { env, loadExample } = createServer({
            params: { custscript_mcl_mr_file: 501, custscript_mcl_mr_subsidiary: 2 },
            files: { 501: CSV },
            search: (options) => (JSON.stringify(options.filters).includes('C-4') ? [searchResult(900)] : []),
        });
        const script = loadExample('mr_customer_import.js');
        const rows = script.getInputData({});
        const readLog = sentLogs(env)[0];
        check('lee las filas, saltando cabecera, BOM y líneas vacías', () => rows.length === 4 && rows.map((r) => r.line).join(',') === '2,3,4,6');
        check('detecta el punto y coma y respeta las comillas', () => rows[0].values.companyname === 'Pérez; S.A.');
        check('las columnas valen en cualquier orden y en mayúsculas', () => rows[0].values.externalid === 'C-1' && rows[0].values.email === 'ventas@perez.com');
        check('registra info con las filas leídas', () => readLog.message === 'Importación de clientes: fichero leído' && readLog.metadata.rows === 4);

        const requestsBeforeMap = env.mclogRequests.length;
        const outputs = runImport(script, rows);
        check('crea el cliente válido con su subsidiaria', () =>
            env.createdRecords.length === 1 && env.createdRecords[0].values.companyname === 'Pérez; S.A.' && env.createdRecords[0].values.subsidiary === 2);
        check('salta el que ya existe', () => outputs.some((o) => o.key === 'skipped' && o.value === '6'));
        check('los map no envían nada a MCLog', () => env.mclogRequests.length === requestsBeforeMap + 1);

        const summaryLogs = env.mclogRequests[env.mclogRequests.length - 1].body.logs;
        const [business, library] = summaryLogs;
        check('el resumen es warn si hubo rechazados', () => business.level === 'warn' && business.message === 'Importación de clientes terminada con filas rechazadas');
        check('con los totales', () => business.metadata.created === 1 && business.metadata.skipped === 1 && business.metadata.rejected === 2);
        check('y una muestra con línea y motivo', () =>
            JSON.stringify(business.metadata.rejectedSample) === '[{"line":3,"problems":["externalid vacío"]},{"line":4,"problems":["email no válido"]}]');
        check('lib_mclog añade su resumen de governance', () => library.message === 'Map/Reduce finalizado' && library.metadata.usage === 120);
    }
    {
        const { env, loadExample } = createServer({ params: { custscript_mcl_mr_file: 7 }, files: { 7: 'externalid,companyname\n1,"ACME ""Norte"", S.L."' } });
        const rows = loadExample('mr_customer_import.js').getInputData({});
        check('con coma, las comillas dobles escapadas se conservan', () => rows[0].values.companyname === 'ACME "Norte", S.L.');
        check('una importación sin rechazos cierra con info', () => {
            runImport(loadExample('mr_customer_import.js'), rows);
            const logs = sentLogs(env);
            return logs.some((l) => l.level === 'info' && l.message === 'Importación de clientes terminada');
        });
    }
    {
        const { env, loadExample } = createServer();
        const thrown = captureThrow(() => loadExample('mr_customer_import.js').getInputData({}));
        const [log] = sentLogs(env);
        check('sin fichero configurado falla con un código propio', () => thrown && thrown.name === 'MC_IMPORT_NOT_CONFIGURED');
        check('y lib_mclog lo registra sola', () => log.message.startsWith('Error no controlado en getInputData') && log.errorName === 'MC_IMPORT_NOT_CONFIGURED');
    }
    {
        const { loadExample } = createServer({ params: { custscript_mcl_mr_file: 8 }, files: { 8: 'externalid;email\nC-1;a@b.com' } });
        const thrown = captureThrow(() => loadExample('mr_customer_import.js').getInputData({}));
        check('una cabecera sin columnas obligatorias se rechaza', () => thrown.name === 'MC_IMPORT_BAD_HEADER' && thrown.message.includes('companyname'));
    }
    {
        const failure = new FakeSuiteScriptError('DUP_ENTITY', 'Ya existe una entidad con ese nombre');
        const { env, loadExample } = createServer({ saveError: failure });
        const script = loadExample('mr_customer_import.js');
        const thrown = captureThrow(() => script.map({ key: '4', value: JSON.stringify({ line: 9, values: { externalid: 'C-9', companyname: 'X' } }), write: () => {} }));
        const [log] = sentLogs(env);
        check('un fallo inesperado en map se relanza para que NetSuite lo cuente', () => thrown === failure);
        check('y se registra con la línea del CSV y la clave', () =>
            log.errorName === 'DUP_ENTITY' && log.metadata.csvLine === 9 && log.metadata.key === '4' && log.metadata.externalId === 'C-9');
    }
}

// ------------------------------------------------------------------ receta 7

group('Receta 7 — sl_mclog_browser_proxy');
{
    const entry = (overrides = {}) => ({
        level: 'error',
        message: 'No se pudo consultar el cliente',
        metadata: { customerId: 12 },
        error: { name: 'SSS_MISSING_REQD_ARGUMENT', message: 'Falta id', stack: 'at fieldChanged (cs.js:3)' },
        document: { type: 'salesorder', id: '55' },
        ...overrides,
    });
    const body = (entries, extra = {}) => JSON.stringify({ clientScript: 'customscript_mcl_so_form', page: '/app/accounting/transactions/salesord.nl', entries, ...extra });

    {
        const { env, loadExample } = createServer();
        const context = suiteletContext({ body: body([entry(), entry({ level: 'warn', message: 'Descuento raro', error: undefined })]) });
        loadExample('sl_mclog_browser_proxy.js').onRequest(context);
        const logs = sentLogs(env);
        check('acepta y reenvía los logs', () => context.reply().ok === true && context.reply().accepted === 2 && logs.length === 2);
        check('responde JSON', () => context.response.headers['Content-Type'] === 'application/json');
        check('marca el origen: navegador, script y página', () =>
            logs[0].metadata.source === 'browser' && logs[0].metadata.clientScript === 'customscript_mcl_so_form' &&
            logs[0].metadata.page === '/app/accounting/transactions/salesord.nl');
        check('con el traceId del documento, igual que en el servidor', () => logs[0].traceId === 'salesorder:55' && logs[0].metadata.recordType === 'salesorder');
        check('el error del navegador es agrupable', () => logs[0].errorName === 'SSS_MISSING_REQD_ARGUMENT' && logs[0].errorStack === 'at fieldChanged (cs.js:3)');
        check('en una sola petición a MCLog', () => env.mclogRequests.length === 1);
    }
    {
        const rejected = (options) => {
            const { env, loadExample } = createServer();
            const context = suiteletContext(options);
            loadExample('sl_mclog_browser_proxy.js').onRequest(context);
            return { reply: context.reply(), logs: sentLogs(env) };
        };
        const get = rejected({ method: 'GET', body: body([entry()]) });
        check('rechaza GET', () => get.reply.ok === false && get.reply.error === 'Solo se admite POST' && get.logs.length === 0);
        const noHeader = rejected({ headers: {}, body: body([entry()]) });
        check('rechaza sin la cabecera X-MCLog-Client', () => noHeader.reply.ok === false && noHeader.logs.length === 0);
        const upperCase = rejected({ headers: { 'X-MCLOG-CLIENT': '1' }, body: body([entry()]) });
        check('la cabecera no distingue mayúsculas', () => upperCase.reply.ok === true);
        const invalid = rejected({ body: '{no es json' });
        check('rechaza JSON inválido', () => invalid.reply.error === 'JSON no válido' && invalid.logs.length === 0);
        const huge = rejected({ body: body([entry({ message: 'x'.repeat(25000) })]) });
        check('rechaza un cuerpo demasiado grande', () => huge.reply.error === 'Cuerpo demasiado grande' && huge.logs.length === 0);
        const noEntries = rejected({ body: JSON.stringify({ clientScript: 'customscript_x' }) });
        check('rechaza un cuerpo sin entries', () => noEntries.reply.error === 'Falta la lista entries');
    }
    {
        const { env, loadExample } = createServer();
        const entries = [entry({ level: 'fatal' }), entry({ message: '   ' }), ...Array.from({ length: 6 }, (_, i) => entry({ message: `m${i}` }))];
        const context = suiteletContext({ body: body(entries) });
        loadExample('sl_mclog_browser_proxy.js').onRequest(context);
        check('descarta niveles desconocidos y mensajes vacíos', () => !sentLogs(env).some((l) => l.level === 'fatal'));
        check('y procesa como mucho 5 entradas', () => context.reply().accepted === 3 && sentLogs(env).length === 3);
    }
    {
        const { env, loadExample } = createServer();
        const context = suiteletContext({
            body: body(
                [entry({ metadata: { source: 'server', clientScript: 'customscript_admin', password: 'hunter2' }, document: { type: 'salesorder; DROP', id: '1' } })],
                { clientScript: 'javascript:alert(1)' }
            ),
        });
        loadExample('sl_mclog_browser_proxy.js').onRequest(context);
        const [log] = sentLogs(env);
        check('el navegador no puede cambiar el origen', () => log.metadata.source === 'browser' && log.metadata.clientScript === 'unknown');
        check('un tipo de registro con formato raro se ignora', () => log.traceId.startsWith('exec-') && log.metadata.recordType === undefined);
        check('lib_mclog oculta las credenciales', () => log.metadata.password === '[REDACTED]');
    }
}

// ------------------------------------------------------------------ pruebas asíncronas (navegador)

const runAsyncTests = async () => {
    group('Receta 7 — lib_mclog_browser');
    {
        const { env, browserLib } = createBrowser();
        const failure = new TypeError('Cannot read properties of undefined');
        browserLib.exception('No se pudo calcular el descuento', failure, { fieldId: 'discount' });
        const request = env.proxyRequests[0];
        const sent = request.body.entries[0];
        check('envía al Suitelet proxy resuelto con N/url', () =>
            request.url === PROXY_URL && env.resolved[0].scriptId === 'customscript_mcl_browser_proxy' && env.resolved[0].deploymentId === 'customdeploy_mcl_browser_proxy');
        check('con la cabecera X-MCLog-Client', () => request.headers['X-MCLog-Client'] === '1');
        check('nunca con una API key', () => !JSON.stringify(request).toLowerCase().includes('api-key'));
        check('con el error serializado', () => sent.level === 'error' && sent.error.name === 'TypeError' && typeof sent.error.stack === 'string');
        check('con el registro abierto y el script que lo envía', () =>
            sent.document.type === 'salesorder' && sent.document.id === '55' && request.body.clientScript === 'customscript_mcl_so_form');

        browserLib.exception('No se pudo calcular el descuento', new TypeError('Cannot read properties of undefined'));
        check('el mismo error se envía una sola vez por página', () => env.proxyRequests.length === 1);
    }
    {
        const { env, browserLib } = createBrowser();
        for (let i = 0; i < 15; i++) browserLib.warn(`aviso ${i}`);
        check('como mucho 10 envíos por página', () => env.proxyRequests.length === 10);
    }
    {
        const { env, browserLib } = createBrowser();
        const failure = new Error('boom');
        const wrapped = browserLib.wrapEntryPoints({ fieldChanged: () => { throw failure; }, pageInit: 'no-es-funcion' });
        const thrown = captureThrow(() => wrapped.fieldChanged({ fieldId: 'entity' }));
        const sent = env.proxyRequests[0].body.entries[0];
        check('el envoltorio relanza la excepción intacta', () => thrown === failure);
        check('y la envía como no controlada', () => sent.message === 'Error no controlado en fieldChanged' && sent.metadata.fieldId === 'entity');
        check('deja igual lo que no es función', () => wrapped.pageInit === 'no-es-funcion');
    }
    {
        const { env, browserLib } = createBrowser();
        const failure = new Error('ya registrado');
        const wrapped = browserLib.wrapEntryPoints({
            saveRecord: () => {
                try {
                    throw failure;
                } catch (e) {
                    browserLib.exception('Fallo al validar', e);
                    throw e;
                }
            },
        });
        captureThrow(() => wrapped.saveRecord({}));
        check('una excepción ya enviada no se repite al relanzarla', () => env.proxyRequests.length === 1);
    }
    {
        const { env, browserLib } = createBrowser({ proxyFails: true, currentRecord: { type: 'salesorder', id: '' } });
        let unhandled = false;
        const onUnhandled = () => {
            unhandled = true;
        };
        process.on('unhandledRejection', onUnhandled);
        browserLib.error('Algo falló');
        await tick();
        process.off('unhandledRejection', onUnhandled);
        check('si el proxy no responde, no deja promesas sin capturar', () => !unhandled);
        check('en un registro nuevo se envía el tipo sin id', () => env.proxyRequests[0].body.entries[0].document.id === undefined);
    }

    group('Receta 7 — cs_sales_order_form');
    {
        const failure = new FakeSuiteScriptError('SSS_INSUFFICIENT_PERMISSION', 'Permiso insuficiente');
        const { env, loadExample } = createBrowser({ lookup: () => { throw failure; } });
        const script = loadExample('cs_sales_order_form.js');
        const thrown = captureThrow(() => script.fieldChanged({ fieldId: 'entity', currentRecord: { getValue: () => 12 } }));
        const sent = env.proxyRequests[0] && env.proxyRequests[0].body.entries[0];
        check('si la consulta falla, el usuario sigue trabajando', () => thrown === undefined && env.alerts.length === 0);
        check('y el fallo llega al proxy con el cliente', () =>
            sent.message === 'No se pudo consultar la retención de crédito del cliente' && sent.metadata.customerId === 12 &&
            sent.error.name === 'SSS_INSUFFICIENT_PERMISSION');
    }
    {
        const { env, loadExample } = createBrowser({ lookup: () => ({ creditholdoverride: [{ value: 'ON', text: 'On' }] }) });
        loadExample('cs_sales_order_form.js').fieldChanged({ fieldId: 'entity', currentRecord: { getValue: () => 12 } });
        check('un cliente retenido muestra el aviso sin enviar logs', () => env.alerts.length === 1 && env.proxyRequests.length === 0);
    }
    {
        const { env, loadExample } = createBrowser({ lookup: () => { throw new Error('no debería consultarse'); } });
        loadExample('cs_sales_order_form.js').fieldChanged({ fieldId: 'memo', currentRecord: { getValue: () => 'x' } });
        check('otros campos no hacen nada', () => env.proxyRequests.length === 0);
    }

    group('Receta 7 — de extremo a extremo');
    {
        const browser = createBrowser();
        browser.browserLib.exception('Fallo en el formulario', new RangeError('Índice fuera de rango'), { line: 3 });
        const { env, loadExample } = createServer();
        const context = suiteletContext({ headers: browser.env.proxyRequests[0].headers, body: browser.env.proxyRequests[0].rawBody });
        loadExample('sl_mclog_browser_proxy.js').onRequest(context);
        const [log] = sentLogs(env);
        check('lo que envía el navegador lo acepta el proxy', () => context.reply().ok === true);
        check('y llega a MCLog como un error agrupable del documento', () =>
            log.level === 'error' && log.errorName === 'RangeError' && log.traceId === 'salesorder:55' &&
            log.message === 'Fallo en el formulario: Índice fuera de rango' && log.metadata.line === 3);
        check('con la API key solo en la petición del servidor', () => env.mclogRequests[0].headers['x-api-key'] === 'mclog_test_key');
    }
};

// ------------------------------------------------------------------ cierre

runAsyncTests().then(() => {
    console.log(failures === 0 ? `\nTodo correcto (${checks} comprobaciones).` : `\n${failures} de ${checks} comprobaciones fallidas.`);
    process.exit(failures === 0 ? 0 : 1);
});
