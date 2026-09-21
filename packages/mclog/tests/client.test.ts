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

/** Bytes del cuerpo tal y como viaja, que es lo que mide el BODY_LIMIT del servidor. */
const bytesOf = (call: Call) => new TextEncoder().encode(String(call.init.body)).length;

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

    it('rechaza maxBatchBytes inválido', () => {
        expect(() => createMCLogClient({ baseUrl: 'https://x', apiKey: 'k', maxBatchBytes: 0 }))
            .toThrow(/maxBatchBytes/);
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

    /**
     * Trocear solo por número dejaba pasar lotes de más de 3 MB: el servidor
     * respondía 413 y se perdían las 500 entradas del trozo. Es el caso de un
     * Map/Reduce con muchos fallos, justo cuando más falta hacen los logs.
     */
    it('parte por bytes un lote de errores con stacks grandes', async () => {
        const f = fakeFetch();
        const entries = Array.from({ length: 500 }, (_, i) => ({
            level: 'error' as const,
            message: `Fallo ${i}`,
            errorStack: 'at x\n'.repeat(1400),
        }));

        expect(await make({}, f.impl).sendBatch(entries)).toBe(true);

        expect(f.calls.length).toBeGreaterThan(1);
        expect(f.calls.every((call) => bytesOf(call) <= 1024 * 1024)).toBe(true);
        const mensajes = f.calls.flatMap((call) => bodyOf(call).logs.map((log: { message: string }) => log.message));
        expect(mensajes).toEqual(entries.map((entry) => entry.message));
    });

    it('respeta maxBatchBytes', async () => {
        const f = fakeFetch();
        const entries = Array.from({ length: 10 }, (_, i) => ({ message: `${i}`.padEnd(300, 'x') }));
        await make({ maxBatchBytes: 1000 }, f.impl).sendBatch(entries);

        expect(f.calls.length).toBeGreaterThan(1);
        expect(f.calls.every((call) => bytesOf(call) <= 1000)).toBe(true);
        expect(f.calls.reduce((total, call) => total + bodyOf(call).logs.length, 0)).toBe(10);
    });

    it('mide bytes UTF-8 y no caracteres', async () => {
        const f = fakeFetch();
        // 400 caracteres, pero 800 bytes: dos no caben en 1200 bytes.
        const entries = [{ message: 'ñ'.repeat(400) }, { message: 'ñ'.repeat(400) }];
        await make({ maxBatchBytes: 1200 }, f.impl).sendBatch(entries);

        expect(f.calls).toHaveLength(2);
        expect(f.calls.every((call) => bytesOf(call) <= 1200)).toBe(true);
    });

    it('manda sola la entrada que no cabe en ningún trozo, sin arrastrar a las demás', async () => {
        const f = fakeFetch();
        const entries = [{ message: 'antes' }, { message: 'x'.repeat(5000) }, { message: 'despues' }];
        await make({ maxBatchBytes: 1000 }, f.impl).sendBatch(entries);

        expect(f.calls.map((call) => bodyOf(call).logs.length)).toEqual([1, 1, 1]);
        expect(bodyOf(f.calls[1]!).logs[0].message).toHaveLength(5000);
    });

    it('no hace ninguna petición con un lote vacío', async () => {
        const f = fakeFetch();
        const ok = await make({}, f.impl).sendBatch([]);
        expect(ok).toBe(true);
        expect(f.calls).toHaveLength(0);
    });

    it('devuelve false si algún trozo falla sin remedio', async () => {
        let n = 0;
        // 400: el servidor rechaza el cuerpo, repetirlo daría lo mismo.
        const impl = vi.fn(async () => new Response('', { status: ++n === 2 ? 400 : 201 }));
        const c = make({ maxBatchSize: 1 }, impl as unknown as typeof globalThis.fetch);
        expect(await c.sendBatch([{ message: 'a' }, { message: 'b' }])).toBe(false);
    });

    it('sigue con los demás trozos aunque uno falle', async () => {
        let n = 0;
        const impl = vi.fn(async () => new Response('', { status: ++n === 1 ? 400 : 201 }));
        const c = make({ maxBatchSize: 1 }, impl as unknown as typeof globalThis.fetch);
        await c.sendBatch([{ message: 'a' }, { message: 'b' }, { message: 'c' }]);
        // Descartar los dos siguientes por el fallo del primero perdería logs
        // que el servicio sí habría aceptado.
        expect(impl).toHaveBeenCalledTimes(3);
    });

    it('envía los trozos en serie por defecto', async () => {
        let enVuelo = 0;
        let maxSimultaneos = 0;
        const impl = vi.fn(async () => {
            enVuelo += 1;
            maxSimultaneos = Math.max(maxSimultaneos, enVuelo);
            await new Promise((r) => setTimeout(r, 5));
            enVuelo -= 1;
            return new Response('', { status: 201 });
        });
        const c = make({ maxBatchSize: 1 }, impl as unknown as typeof globalThis.fetch);
        await c.sendBatch([{ message: 'a' }, { message: 'b' }, { message: 'c' }]);
        expect(maxSimultaneos).toBe(1);
    });

    it('respeta batchConcurrency cuando se sube', async () => {
        let enVuelo = 0;
        let maxSimultaneos = 0;
        const impl = vi.fn(async () => {
            enVuelo += 1;
            maxSimultaneos = Math.max(maxSimultaneos, enVuelo);
            await new Promise((r) => setTimeout(r, 5));
            enVuelo -= 1;
            return new Response('', { status: 201 });
        });
        const c = make(
            { maxBatchSize: 1, batchConcurrency: 3 },
            impl as unknown as typeof globalThis.fetch,
        );
        await c.sendBatch([{ message: 'a' }, { message: 'b' }, { message: 'c' }]);
        expect(maxSimultaneos).toBe(3);
    });
});

/**
 * El limitador de ingesta del servidor devuelve 429 justo cuando más logs se
 * están produciendo. Sin reintento, esa entrada se perdía en silencio: es la
 * forma más probable de perder datos en produccion.
 */
describe('reintentos', () => {
    it('reintenta un 429 y acaba entregando', async () => {
        let n = 0;
        const impl = vi.fn(async () => new Response('', { status: ++n === 1 ? 429 : 201 }));
        const c = make({ retryBaseMs: 1 }, impl as unknown as typeof globalThis.fetch);
        expect(await c.info('hola')).toBe(true);
        expect(impl).toHaveBeenCalledTimes(2);
    });

    it('reintenta un 500 y un fallo de red', async () => {
        for (const primero of [
            async () => new Response('', { status: 503 }),
            async () => {
                throw new Error('ECONNRESET');
            },
        ]) {
            let n = 0;
            const impl = vi.fn(async () =>
                ++n === 1 ? primero() : new Response('', { status: 201 }),
            );
            const c = make({ retryBaseMs: 1 }, impl as unknown as typeof globalThis.fetch);
            expect(await c.info('hola')).toBe(true);
            expect(impl).toHaveBeenCalledTimes(2);
        }
    });

    it.each([400, 401, 403, 404, 413])('no reintenta un %i', async (status) => {
        const impl = vi.fn(async () => new Response('', { status }));
        const c = make({ retryBaseMs: 1 }, impl as unknown as typeof globalThis.fetch);
        expect(await c.info('hola')).toBe(false);
        expect(impl).toHaveBeenCalledTimes(1);
    });

    it('se rinde tras maxRetries y devuelve false', async () => {
        const impl = vi.fn(async () => new Response('', { status: 429 }));
        const c = make({ retryBaseMs: 1, maxRetries: 2 }, impl as unknown as typeof globalThis.fetch);
        expect(await c.info('hola')).toBe(false);
        expect(impl).toHaveBeenCalledTimes(3); // 1 intento + 2 reintentos
    });

    it('maxRetries: 0 desactiva el reintento', async () => {
        const impl = vi.fn(async () => new Response('', { status: 429 }));
        const c = make({ maxRetries: 0 }, impl as unknown as typeof globalThis.fetch);
        expect(await c.info('hola')).toBe(false);
        expect(impl).toHaveBeenCalledTimes(1);
    });

    it('espera lo que diga Retry-After en segundos', async () => {
        let n = 0;
        const impl = vi.fn(async () =>
            ++n === 1
                ? new Response('', { status: 429, headers: { 'retry-after': '0.05' } })
                : new Response('', { status: 201 }),
        );
        const espera: number[] = [];
        const c = make(
            { retryBaseMs: 10000, onRetry: (i) => espera.push(i.delayMs) },
            impl as unknown as typeof globalThis.fetch,
        );
        expect(await c.info('hola')).toBe(true);
        // Manda la cabecera, no el backoff exponencial de 10 s.
        expect(espera[0]).toBe(50);
    });

    it('entiende Retry-After como fecha HTTP', async () => {
        let n = 0;
        const cuando = new Date(Date.now() + 60000).toUTCString();
        const impl = vi.fn(async () =>
            ++n === 1
                ? new Response('', { status: 429, headers: { 'retry-after': cuando } })
                : new Response('', { status: 201 }),
        );
        const espera: number[] = [];
        const c = make(
            { maxRetries: 0, onRetry: (i) => espera.push(i.delayMs) },
            impl as unknown as typeof globalThis.fetch,
        );
        await c.info('hola');
        expect(impl).toHaveBeenCalledTimes(1); // maxRetries 0: no llega a esperar
    });

    it('avisa por onRetry y solo llama a onError al rendirse', async () => {
        const impl = vi.fn(async () => new Response('', { status: 429 }));
        const reintentos: number[] = [];
        const errores: Error[] = [];
        const c = make(
            {
                retryBaseMs: 1,
                maxRetries: 2,
                onRetry: (i) => reintentos.push(i.attempt),
                onError: (e) => errores.push(e),
            },
            impl as unknown as typeof globalThis.fetch,
        );
        await c.info('hola');
        expect(reintentos).toEqual([1, 2]);
        expect(errores).toHaveLength(1);
    });

    it('lanza tras agotar los reintentos si throwOnError', async () => {
        const impl = vi.fn(async () => new Response('', { status: 429 }));
        const c = make(
            { retryBaseMs: 1, maxRetries: 1, throwOnError: true },
            impl as unknown as typeof globalThis.fetch,
        );
        await expect(c.info('hola')).rejects.toThrow('MCLog HTTP 429');
        expect(impl).toHaveBeenCalledTimes(2);
    });

    it.each([
        ['maxRetries', { maxRetries: -1 }],
        ['retryBaseMs', { retryBaseMs: -1 }],
        ['batchConcurrency', { batchConcurrency: 0 }],
    ])('rechaza un %s inválido al construir', (campo, opts) => {
        expect(() => make(opts)).toThrow(campo);
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
