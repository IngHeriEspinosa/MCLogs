import { describe, it, expect, vi } from 'vitest';
import { createMCLogClient, type MCLogClientOptions } from '../src/index';

type Call = { url: string; init: RequestInit };

/** fetch falso que registra las llamadas y devuelve la respuesta indicada. */
const fakeFetch = (status = 201, body = '') => {
    const calls: Call[] = [];
    const impl = vi.fn(async (url: any, init: any) => {
        calls.push({ url: String(url), init });
        return new Response(body, { status });
    });
    return { calls, impl: impl as unknown as typeof globalThis.fetch };
};

const make = (opts: Partial<MCLogClientOptions> = {}, fetchImpl?: typeof globalThis.fetch) =>
    createMCLogClient({
        baseUrl: 'https://mclog.test',
        apiKey: 'k',
        application: 'app-x',
        environment: 'production',
        fetch: fetchImpl,
        ...opts,
    });

const bodyOf = (call: Call) => JSON.parse(String(call.init.body));

describe('createMCLogClient — construcción', () => {
    it('exige baseUrl', () => {
        expect(() => createMCLogClient({ baseUrl: '', apiKey: 'k' })).toThrow(/baseUrl/);
    });

    it('exige apiKey', () => {
        expect(() => createMCLogClient({ baseUrl: 'https://x', apiKey: '  ' })).toThrow(/apiKey/);
    });

    it('rechaza maxBatchSize inválido', () => {
        expect(() => createMCLogClient({ baseUrl: 'https://x', apiKey: 'k', maxBatchSize: 0 }))
            .toThrow(/maxBatchSize/);
    });
});

describe('createMCLogClient — envío', () => {
    it('normaliza la baseUrl y pega la ruta /api/log', async () => {
        const f = fakeFetch();
        await make({ baseUrl: 'https://mclog.test///' }, f.impl).info('hola');
        expect(f.calls[0]!.url).toBe('https://mclog.test/api/log');
    });

    it('manda la API key y el Content-Type', async () => {
        const f = fakeFetch();
        await make({}, f.impl).info('hola');
        const headers = f.calls[0]!.init.headers as Record<string, string>;
        expect(headers['x-api-key']).toBe('k');
        expect(headers['Content-Type']).toBe('application/json');
    });

    it('mezcla cabeceras extra sin perder la API key', async () => {
        const f = fakeFetch();
        await make({ headers: { 'x-tenant': 'acme' } }, f.impl).info('hola');
        const headers = f.calls[0]!.init.headers as Record<string, string>;
        expect(headers['x-tenant']).toBe('acme');
        expect(headers['x-api-key']).toBe('k');
    });

    it('aplica los defaults de application y environment', async () => {
        const f = fakeFetch();
        await make({}, f.impl).warn('cuidado');
        expect(bodyOf(f.calls[0]!)).toMatchObject({
            application: 'app-x',
            environment: 'production',
            level: 'warn',
            message: 'cuidado',
        });
    });

    it('la entrada concreta gana sobre los defaults', async () => {
        const f = fakeFetch();
        await make({}, f.impl).send({
            message: 'm',
            application: 'otra',
            environment: 'staging',
            level: 'error',
        });
        expect(bodyOf(f.calls[0]!)).toMatchObject({
            application: 'otra',
            environment: 'staging',
            level: 'error',
        });
    });

    it('cae a unknown-app / development si no hay defaults', async () => {
        const f = fakeFetch();
        const c = createMCLogClient({ baseUrl: 'https://x', apiKey: 'k', fetch: f.impl });
        await c.info('m');
        expect(bodyOf(f.calls[0]!)).toMatchObject({
            application: 'unknown-app',
            environment: 'development',
        });
    });

    it('no emite claves opcionales cuando no se han dado', async () => {
        const f = fakeFetch();
        await make({}, f.impl).info('m');
        const sent = bodyOf(f.calls[0]!);
        expect(sent).not.toHaveProperty('service');
        expect(sent).not.toHaveProperty('traceId');
        expect(sent).not.toHaveProperty('metadata');
    });

    it('fusiona defaultMetadata con la metadata de la llamada', async () => {
        const f = fakeFetch();
        await make({ defaultMetadata: { region: 'eu', app: 'base' } }, f.impl)
            .error('boom', { orderId: 42, app: 'override' });
        expect(bodyOf(f.calls[0]!).metadata).toEqual({
            region: 'eu',
            app: 'override',
            orderId: 42,
        });
    });

    it('expone un helper por cada nivel', async () => {
        const f = fakeFetch();
        const c = make({}, f.impl);
        await Promise.all([c.debug('a'), c.info('b'), c.warn('c'), c.error('d')]);
        expect(f.calls.map((x) => bodyOf(x).level).sort()).toEqual(['debug', 'error', 'info', 'warn']);
    });
});

describe('createMCLogClient — sendBatch', () => {
    it('usa /api/logs/batch y envuelve en { logs }', async () => {
        const f = fakeFetch();
        await make({}, f.impl).sendBatch([{ message: 'a' }, { message: 'b' }]);
        expect(f.calls[0]!.url).toBe('https://mclog.test/api/logs/batch');
        expect(bodyOf(f.calls[0]!).logs).toHaveLength(2);
    });

    it('trocea en peticiones de maxBatchSize', async () => {
        const f = fakeFetch();
        const entries = Array.from({ length: 1200 }, (_, i) => ({ message: `m${i}` }));
        await make({ maxBatchSize: 500 }, f.impl).sendBatch(entries);
        expect(f.calls).toHaveLength(3);
        expect(bodyOf(f.calls[0]!).logs).toHaveLength(500);
        expect(bodyOf(f.calls[2]!).logs).toHaveLength(200);
    });

    it('no hace ninguna petición con un lote vacío', async () => {
        const f = fakeFetch();
        const ok = await make({}, f.impl).sendBatch([]);
        expect(ok).toBe(true);
        expect(f.calls).toHaveLength(0);
    });

    it('devuelve false si algún trozo falla', async () => {
        let n = 0;
        const impl = vi.fn(async () => new Response('', { status: ++n === 2 ? 500 : 201 }));
        const c = make({ maxBatchSize: 1 }, impl as unknown as typeof globalThis.fetch);
        expect(await c.sendBatch([{ message: 'a' }, { message: 'b' }])).toBe(false);
    });
});

describe('createMCLogClient — errores', () => {
    it('no rompe la app y devuelve false si el servicio responde error', async () => {
        const f = fakeFetch(500, 'boom');
        expect(await make({}, f.impl).info('m')).toBe(false);
    });

    it('no rompe la app si la red falla', async () => {
        const impl = vi.fn(async () => {
            throw new Error('ECONNREFUSED');
        });
        const c = make({}, impl as unknown as typeof globalThis.fetch);
        expect(await c.info('m')).toBe(false);
    });

    it('no escribe en consola por su cuenta', async () => {
        const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
        const f = fakeFetch(500, 'boom');
        await make({}, f.impl).info('m');
        expect(spy).not.toHaveBeenCalled();
        spy.mockRestore();
    });

    it('invoca onError con el detalle del fallo HTTP', async () => {
        const onError = vi.fn();
        const f = fakeFetch(503, 'unavailable');
        await make({ onError }, f.impl).info('m');
        expect(onError).toHaveBeenCalledTimes(1);
        expect(onError.mock.calls[0]![0].message).toContain('MCLog HTTP 503');
    });

    it('propaga el error con throwOnError', async () => {
        const f = fakeFetch(500, 'boom');
        await expect(make({ throwOnError: true }, f.impl).info('m')).rejects.toThrow(/MCLog HTTP 500/);
    });

    it('conserva la causa original en fallos de red', async () => {
        const cause = new Error('ECONNREFUSED');
        const impl = vi.fn(async () => {
            throw cause;
        });
        const c = make({ throwOnError: true }, impl as unknown as typeof globalThis.fetch);
        await expect(c.info('m')).rejects.toMatchObject({ cause });
    });
});

describe('createMCLogClient — captura de excepciones', () => {
    it('reparte un Error nativo en clase, mensaje y stack', async () => {
        const f = fakeFetch();
        const error = new TypeError('no se puede leer token');
        await make({}, f.impl).captureException(error);

        const body = bodyOf(f.calls[0]);
        expect(body.level).toBe('error');
        expect(body.message).toBe('no se puede leer token');
        expect(body.errorName).toBe('TypeError');
        expect(body.errorStack).toContain('TypeError');
    });

    it('recoge el codigo de errores del sistema', async () => {
        const f = fakeFetch();
        const error = Object.assign(new Error('conexion cerrada'), { code: 'ECONNRESET' });
        await make({}, f.impl).captureException(error);

        expect(bodyOf(f.calls[0]).errorCode).toBe('ECONNRESET');
    });

    it('convierte a texto un codigo numerico', async () => {
        const f = fakeFetch();
        await make({}, f.impl).captureException(Object.assign(new Error('x'), { code: 502 }));
        expect(bodyOf(f.calls[0]).errorCode).toBe('502');
    });

    it('permite un mensaje propio y metadata sin perder el detalle del error', async () => {
        const f = fakeFetch();
        await make({}, f.impl).captureException(new RangeError('indice invalido'), {
            message: 'Fallo al procesar el pedido',
            metadata: { pedido: 42 },
        });

        const body = bodyOf(f.calls[0]);
        expect(body.message).toBe('Fallo al procesar el pedido');
        expect(body.errorName).toBe('RangeError');
        expect(body.metadata).toEqual({ pedido: 42 });
    });

    it('acepta lo que sea que se haya lanzado, no solo Error', async () => {
        const f = fakeFetch();
        const client = make({}, f.impl);

        await client.captureException('algo fallo');
        expect(bodyOf(f.calls[0]).message).toBe('algo fallo');

        await client.captureException({ name: 'SuiteScriptError', message: 'INVALID_FLD', code: 'USER_ERROR' });
        expect(bodyOf(f.calls[1]).errorName).toBe('SuiteScriptError');

        // Ni siquiera con null debe romper la aplicacion emisora.
        await client.captureException(null);
        expect(bodyOf(f.calls[2]).message).toBe('Unhandled exception');
    });

    it('une el stack en array, como lo entrega NetSuite', async () => {
        const f = fakeFetch();
        await make({}, f.impl).captureException({
            name: 'SuiteScriptError',
            message: 'fallo',
            stack: ['crear(/SuiteScripts/factura.js:88)', 'afterSubmit(/SuiteScripts/factura.js:12)'],
        });

        expect(bodyOf(f.calls[0]).errorStack).toBe(
            'crear(/SuiteScripts/factura.js:88)\nafterSubmit(/SuiteScripts/factura.js:12)',
        );
    });

    it('send acepta tambien el campo error, y lo escrito a mano gana', async () => {
        const f = fakeFetch();
        await make({}, f.impl).send({
            level: 'error',
            message: 'mio',
            error: new TypeError('de la excepcion'),
            errorName: 'NombrePropio',
        });

        const body = bodyOf(f.calls[0]);
        expect(body.message).toBe('mio');
        expect(body.errorName).toBe('NombrePropio');
        expect(body.errorStack).toContain('TypeError');
        // El objeto no viaja: ya se ha repartido en campos planos.
        expect(body).not.toHaveProperty('error');
    });

    it('respeta una huella enviada a mano', async () => {
        const f = fakeFetch();
        await make({}, f.impl).send({ level: 'error', message: 'x', fingerprint: 'mi-huella' });
        expect(bodyOf(f.calls[0]).fingerprint).toBe('mi-huella');
    });
});
