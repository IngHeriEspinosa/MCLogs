import { afterEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import {
    createMCLogClient,
    formatTraceparent,
    getContext,
    parseTraceparent,
    traceContext,
    traceHeaders,
    withContext,
    type MCLogClientOptions,
} from '../src/index';

type Call = { url: string; init: RequestInit };

const fakeFetch = () => {
    const calls: Call[] = [];
    const impl = vi.fn(async (url: any, init: any) => {
        calls.push({ url: String(url), init });
        return new Response('', { status: 201 });
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

const TRACE = '4bf92f3577b34da6a3ce929d0e0e4736';
const SPAN = '00f067aa0ba902b7';

afterEach(() => {
    vi.unstubAllEnvs();
});

describe('traceparent', () => {
    it('lee traceId y spanId de una cabecera W3C, sin distinguir mayúsculas', () => {
        expect(parseTraceparent(`00-${TRACE.toUpperCase()}-${SPAN}-01`)).toEqual({ traceId: TRACE, spanId: SPAN });
    });

    it('rechaza las cabeceras mal formadas y los identificadores todo ceros', () => {
        expect(parseTraceparent('00-abc-def-01')).toBeNull();
        expect(parseTraceparent(`00-${'0'.repeat(32)}-${SPAN}-01`)).toBeNull();
        expect(parseTraceparent(`00-${TRACE}-${'0'.repeat(16)}-01`)).toBeNull();
        expect(parseTraceparent(undefined)).toBeNull();
    });

    it('solo forma la cabecera con identificadores W3C', () => {
        expect(formatTraceparent(TRACE, SPAN)).toBe(`00-${TRACE}-${SPAN}-01`);
        expect(formatTraceparent('pedido-42', SPAN)).toBeNull();
    });
});

describe('withContext', () => {
    it('hereda el contexto, mezcla la metadata y un campo undefined no borra lo heredado', () => {
        withContext({ traceId: 't1', service: 'api', metadata: { a: 1 } }, () => {
            withContext({ spanId: 's1', service: undefined, metadata: { b: 2 } }, () => {
                expect(getContext()).toEqual({ traceId: 't1', spanId: 's1', service: 'api', metadata: { a: 1, b: 2 } });
            });
        });
        expect(getContext()).toBeUndefined();
    });

    it('sobrevive a un await', async () => {
        await withContext({ traceId: 't2' }, async () => {
            await new Promise((resolve) => setTimeout(resolve, 1));
            expect(getContext()?.traceId).toBe('t2');
        });
    });

    it('traceHeaders propaga la traza activa', () => {
        expect(traceHeaders()).toEqual({});
        withContext({ traceId: TRACE, spanId: SPAN }, () => {
            expect(traceHeaders()).toEqual({ 'x-trace-id': TRACE, traceparent: `00-${TRACE}-${SPAN}-01` });
        });
        withContext({ traceId: 'pedido-42' }, () => {
            expect(traceHeaders()).toEqual({ 'x-trace-id': 'pedido-42' });
        });
    });
});

describe('cliente dentro de un contexto', () => {
    it('cada log toma traceId, tramo, servicio y metadata del contexto', async () => {
        const f = fakeFetch();
        await withContext({ traceId: 't1', spanId: 's1', parentSpanId: 'p0', service: 'api', metadata: { route: '/x' } }, () =>
            make({}, f.impl).info('hola', { extra: true }),
        );
        expect(bodyOf(f.calls[0]!)).toMatchObject({
            traceId: 't1',
            spanId: 's1',
            parentSpanId: 'p0',
            service: 'api',
            metadata: { route: '/x', extra: true },
        });
    });

    it('lo del log y lo del cliente mandan sobre el contexto', async () => {
        const f = fakeFetch();
        await withContext({ traceId: 't1', spanId: 's1', parentSpanId: 'p0', service: 'api' }, () =>
            make({ service: 'worker' }, f.impl).send({ message: 'm', traceId: 'propio', spanId: 'otro' }),
        );
        const body = bodyOf(f.calls[0]!);
        expect(body).toMatchObject({ traceId: 'propio', spanId: 'otro', service: 'worker' });
        // El padre del contexto es el de su tramo, no el del tramo puesto a mano.
        expect(body.parentSpanId).toBeUndefined();
    });
});

describe('release', () => {
    it('sale de MCLOG_RELEASE si no se configura', async () => {
        vi.stubEnv('MCLOG_RELEASE', ' 2.4.1 ');
        const f = fakeFetch();
        await make({}, f.impl).info('hola');
        expect(bodyOf(f.calls[0]!).release).toBe('2.4.1');
    });

    it('la opción y el log tienen prioridad sobre la variable', async () => {
        vi.stubEnv('MCLOG_RELEASE', 'env');
        const f = fakeFetch();
        const client = make({ release: 'opcion' }, f.impl);
        await client.info('a');
        await client.send({ message: 'b', release: 'log' });
        expect(bodyOf(f.calls[0]!).release).toBe('opcion');
        expect(bodyOf(f.calls[1]!).release).toBe('log');
    });
});

describe('child', () => {
    it('cambia los valores por defecto y mezcla la metadata del padre', async () => {
        const f = fakeFetch();
        const billing = make({ service: 'api', defaultMetadata: { region: 'eu' } }, f.impl).child({
            service: 'billing',
            metadata: { queue: 'invoices' },
        });
        await billing.warn('lento');
        expect(bodyOf(f.calls[0]!)).toMatchObject({
            application: 'app-x',
            service: 'billing',
            metadata: { region: 'eu', queue: 'invoices' },
        });
    });

    it('un campo sin definir conserva el del padre', async () => {
        const f = fakeFetch();
        await make({ service: 'api' }, f.impl).child({ service: undefined }).info('x');
        expect(bodyOf(f.calls[0]!).service).toBe('api');
    });
});

describe('startSpan', () => {
    it('anida los tramos, registra la duración y los logs de dentro llevan el tramo', async () => {
        const f = fakeFetch();
        const client = make({}, f.impl);
        const outer = client.startSpan('checkout');
        await outer.run(async () => {
            const inner = client.startSpan('charge-card', { service: 'payments' });
            await inner.run(() => client.info('cobrando'));
            await inner.end();
        });
        await outer.end();

        const [inside, innerEnd, outerEnd] = f.calls.map(bodyOf);
        expect(innerEnd).toMatchObject({ message: 'charge-card', level: 'info', service: 'payments', parentSpanId: outer.spanId });
        expect(inside).toMatchObject({ message: 'cobrando', spanId: innerEnd.spanId, parentSpanId: outer.spanId });
        expect(outerEnd.parentSpanId).toBeUndefined();
        expect(new Set([inside.traceId, innerEnd.traceId, outerEnd.traceId])).toEqual(new Set([outer.traceId]));
        expect(Number.isInteger(innerEnd.durationMs) && innerEnd.durationMs >= 0).toBe(true);
    });

    it('con error cierra en nivel error con la excepción, y solo una vez', async () => {
        const f = fakeFetch();
        const span = make({}, f.impl).startSpan('sync');
        const failure = Object.assign(new Error('timeout'), { code: 'ETIMEDOUT' });
        expect(await span.end({ error: failure })).toBe(true);
        expect(await span.end()).toBe(false);
        expect(f.calls).toHaveLength(1);
        expect(bodyOf(f.calls[0]!)).toMatchObject({ level: 'error', message: 'sync', errorName: 'Error', errorCode: 'ETIMEDOUT' });
    });
});

describe('traceContext (middleware)', () => {
    const appWith = (onRequest: () => unknown) => {
        const app = express();
        app.use(traceContext({ service: 'checkout' }));
        app.get('/', async (_req, res) => {
            await new Promise((resolve) => setTimeout(resolve, 1));
            res.json(onRequest());
        });
        return app;
    };

    it('sigue la traza de traceparent y su tramo pasa a ser el padre', async () => {
        const response = await request(appWith(() => getContext())).get('/').set('traceparent', `00-${TRACE}-${SPAN}-01`);
        expect(response.body).toMatchObject({ traceId: TRACE, parentSpanId: SPAN, service: 'checkout' });
        expect(response.body.spanId).toMatch(/^[0-9a-f]{16}$/);
        expect(response.headers['x-trace-id']).toBe(TRACE);
        expect(response.headers.traceparent).toBe(`00-${TRACE}-${response.body.spanId}-01`);
    });

    it('sin traceparent usa x-trace-id, y sin ninguno empieza una traza', async () => {
        const app = appWith(() => getContext());
        const withHeader = await request(app).get('/').set('x-trace-id', 'pedido-42');
        expect(withHeader.body.traceId).toBe('pedido-42');
        expect(withHeader.body.parentSpanId).toBeUndefined();

        const fresh = await request(app).get('/');
        expect(fresh.body.traceId).toMatch(/^[0-9a-f]{32}$/);
    });

    it('ignora un x-trace-id con caracteres que no son de identificador', async () => {
        const response = await request(appWith(() => getContext())).get('/').set('x-trace-id', 'a b<script>');
        expect(response.body.traceId).toMatch(/^[0-9a-f]{32}$/);
    });
});
