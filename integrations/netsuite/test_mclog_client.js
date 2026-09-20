/**
 * Pruebas de mclog_client.js fuera de NetSuite.
 *
 *   node integrations/netsuite/test_mclog_client.js
 *
 * No hay framework ni dependencias a proposito: es el unico modo de que esto se
 * ejecute en CI sin montar un cuarto proyecto npm para un fichero de 200 lineas.
 * Se simulan define() y los modulos N/https, N/log y N/runtime, y se comprueba
 * el payload que saldria por el cable.
 *
 * Lo que no cubre: nada que dependa del runtime real de NetSuite (governance,
 * limites de https, comportamiento de SuiteScriptError). Eso solo se ve en una
 * cuenta de verdad.
 */

const fs = require('fs');
const path = require('path');

// ---------------------------------------------------------------- simulacion

const peticiones = [];
let respuesta = { code: 201, body: '' };

const modulos = {
    'N/https': {
        post: ({ url, body, headers }) => {
            peticiones.push({ url, body: JSON.parse(body), headers });
            return respuesta;
        },
    },
    'N/log': { error: () => {}, audit: () => {}, debug: () => {} },
    'N/runtime': {
        getCurrentScript: () => ({
            id: 'customscript_test',
            deploymentId: 'customdeploy_test',
            getRemainingUsage: () => 1000,
        }),
        getCurrentUser: () => ({ id: 42, role: 3 }),
        executionContext: 'MAPREDUCE',
        accountId: 'TSTACCT',
    },
};

let mclog;
global.define = (deps, factory) => {
    mclog = factory(...deps.map((nombre) => modulos[nombre]));
};
eval(fs.readFileSync(path.join(__dirname, 'mclog_client.js'), 'utf8'));

// ------------------------------------------------------------------ utiles

let fallos = 0;

const reset = () => {
    peticiones.length = 0;
    respuesta = { code: 201, body: '' };
};

/**
 * `condicion` se pasa como funcion para que una comprobacion que reviente
 * —tipico cuando falta la peticion que se esperaba— cuente como fallo y deje
 * correr las demas, en vez de tumbar la ejecucion entera en la primera.
 */
const comprobar = (nombre, condicion, detalle) => {
    let resultado;
    try {
        resultado = typeof condicion === 'function' ? condicion() : condicion;
    } catch (error) {
        resultado = false;
        detalle = `excepcion: ${error.message}`;
    }
    if (resultado) {
        console.log(`  ok   ${nombre}`);
    } else {
        console.log(`  FALLA ${nombre}${detalle === undefined ? '' : ` -> ${detalle}`}`);
        fallos += 1;
    }
};

const grupo = (nombre) => console.log(`\n${nombre}`);

const entradas = (n) =>
    Array.from({ length: n }, (_, i) => ({
        level: 'error',
        application: 'SuiteApp-Test',
        message: `fallo ${i}`,
    }));

// ------------------------------------------------------------------ pruebas

/**
 * El servidor rechaza con 400 el lote que pase de MAX_BATCH_SIZE, y lo rechaza
 * entero. El summarize de un Map/Reduce acumula una entrada por clave fallida,
 * asi que pasar de 500 es normal: sin trocear se perdian todos los logs de la
 * ejecucion en la que mas falta hacian.
 */
grupo('sendBatch: troceo en lotes de 500');

reset();
mclog.sendBatch(entradas(500));
comprobar('500 entradas caben en una peticion', () => peticiones.length === 1, peticiones.length);

reset();
mclog.sendBatch(entradas(501));
comprobar('501 entradas se parten en dos', () => peticiones.length === 2, peticiones.length);
comprobar('el primer trozo lleva 500', () => peticiones[0].body.logs.length === 500);
comprobar('el segundo lleva la que sobra', () => peticiones[1].body.logs.length === 1);

reset();
mclog.sendBatch(entradas(1250));
comprobar('1250 entradas se parten en tres', () => peticiones.length === 3, peticiones.length);
comprobar(
    'no se pierde ninguna entrada por el camino',
    () => peticiones.reduce((total, p) => total + p.body.logs.length, 0) === 1250,
);
comprobar('ningun trozo pasa del tope del servidor', () => peticiones.every((p) => p.body.logs.length <= 500));

reset();
comprobar('un lote vacio no gasta una llamada', () => mclog.sendBatch([]) === true && peticiones.length === 0);

grupo('sendBatch: comportamiento ante fallos');

reset();
respuesta = { code: 400, body: 'Batch too large' };
comprobar('devuelve false si algun trozo falla', () => mclog.sendBatch(entradas(501)) === false);
comprobar('un trozo fallido no aborta los siguientes', () => peticiones.length === 2, peticiones.length);

/**
 * En un SuiteScriptError el codigo estable esta en `name` y el stack llega como
 * array de marcos. El `id` cambia en cada ejecucion: usarlo para agrupar
 * convertiria cada ocurrencia en un grupo propio.
 */
grupo('errorFields');

comprobar(
    'une el stack cuando llega como array de marcos',
    mclog.errorFields({ name: 'INVALID_FLD_VALUE', stack: ['marco 1', 'marco 2'] }).errorStack === 'marco 1\nmarco 2',
);
comprobar('acepta el stack como cadena', mclog.errorFields({ stack: 'a\nb' }).errorStack === 'a\nb');
comprobar('extrae errorCode de e.code', mclog.errorFields({ code: 'ECONNRESET' }).errorCode === 'ECONNRESET');
comprobar('convierte un code numerico', mclog.errorFields({ code: 500 }).errorCode === '500');
comprobar('no inventa errorCode si no lo hay', mclog.errorFields({ name: 'X' }).errorCode === undefined);
comprobar('tolera una excepcion vacia', () => JSON.stringify(mclog.errorFields(null)) === '{}');

grupo('payload enviado al servidor');

reset();
mclog.send('error', {
    application: 'SuiteApp-Test',
    message: 'boom',
    error: { name: 'INVALID_FLD_VALUE', id: 'ejecucion-123', stack: ['a', 'b'] },
});
const enviado = peticiones[0].body;
comprobar('errorName sale de la excepcion', () => enviado.errorName === 'INVALID_FLD_VALUE');
comprobar('el id volatil NO se usa para agrupar', () => enviado.errorCode === undefined);
comprobar('el id volatil se guarda en metadata', () => enviado.metadata.netsuiteErrorId === 'ejecucion-123');
comprobar('el contexto de NetSuite viaja en metadata', () => enviado.metadata.accountId === 'TSTACCT');
comprobar('host derivado de la cuenta', () => enviado.host === 'netsuite-TSTACCT');
comprobar('service por defecto es el scriptId', () => enviado.service === 'customscript_test');
comprobar('la api key va en su cabecera', () => peticiones[0].headers['x-api-key'] !== undefined);
comprobar('el endpoint es el de log suelto', () => peticiones[0].url.endsWith('/api/log'));

reset();
mclog.send('error', { application: 'A', error: { message: 'sin mensaje propio' } });
comprobar('si no hay message se toma el de la excepcion', () => peticiones[0].body.message === 'sin mensaje propio');

grupo('createLogger');

reset();
const appLog = mclog.createLogger({ application: 'SuiteApp-Facturacion', environment: 'staging' });
appLog.info('Factura creada', { recordId: 123 });
comprobar('aplica los valores por defecto', () => peticiones[0].body.application === 'SuiteApp-Facturacion');
comprobar('aplica el entorno por defecto', () => peticiones[0].body.environment === 'staging');
comprobar('el nivel corresponde al metodo', () => peticiones[0].body.level === 'info');
comprobar('la metadata de la llamada llega', () => peticiones[0].body.metadata.recordId === 123);

reset();
appLog.exception('Fallo al facturar', { name: 'TypeError', stack: ['x'] }, { recordId: 9 });
comprobar('exception fuerza nivel error', () => peticiones[0].body.level === 'error');
comprobar('exception conserva el mensaje propio', () => peticiones[0].body.message === 'Fallo al facturar');
comprobar('exception reparte la excepcion', () => peticiones[0].body.errorName === 'TypeError');

// ------------------------------------------------------------------ cierre

console.log(fallos === 0 ? '\nTodo correcto.' : `\n${fallos} comprobaciones fallidas.`);
process.exit(fallos === 0 ? 0 : 1);
