import { describe, it, expect } from 'vitest';
import express from 'express';
import request from 'supertest';
import { validateLog, validateLogBatch } from '../src/express';

const app = express();
app.use(express.json({ limit: '3mb' })); // igual que BODY_LIMIT del servidor
app.post('/logs', ...validateLog, (req, res) => {
    res.status(201).json({ ok: true, body: req.body });
});
app.post('/logs/batch', ...validateLogBatch, (req, res) => {
    res.status(201).json({ ok: true, body: req.body });
});

const valid = {
    application: 'app-x',
    level: 'info',
    environment: 'production',
    message: 'hola',
};

describe('validateLog', () => {
    it('acepta una entrada válida mínima', async () => {
        const res = await request(app).post('/logs').send(valid);
        expect(res.status).toBe(201);
    });

    it('acepta los campos opcionales del contrato', async () => {
        const res = await request(app).post('/logs').send({
            ...valid,
            service: 'orders-worker',
            host: 'node-1',
            traceId: 't-1',
            spanId: 's-1',
            metadata: { orderId: 42 },
        });
        expect(res.status).toBe(201);
    });

    it.each(['application', 'level', 'environment', 'message'])(
        'rechaza si falta %s',
        async (field) => {
            const body: Record<string, unknown> = { ...valid };
            delete body[field];
            const res = await request(app).post('/logs').send(body);
            expect(res.status).toBe(400);
            expect(res.body.errors).toHaveProperty(field);
        },
    );

    it('rechaza un level fuera del enum', async () => {
        const res = await request(app).post('/logs').send({ ...valid, level: 'fatal' });
        expect(res.status).toBe(400);
        expect(res.body.errors.level.msg).toMatch(/debug, info, warn, error/);
    });

    it('rechaza un environment fuera del enum', async () => {
        const res = await request(app).post('/logs').send({ ...valid, environment: 'qa' });
        expect(res.status).toBe(400);
        expect(res.body.errors.environment.msg).toMatch(/development, staging, production/);
    });

    it('rechaza application de más de 120 chars', async () => {
        const res = await request(app).post('/logs').send({ ...valid, application: 'a'.repeat(121) });
        expect(res.status).toBe(400);
        expect(res.body.errors).toHaveProperty('application');
    });

    it('rechaza metadata que sea un array', async () => {
        const res = await request(app).post('/logs').send({ ...valid, metadata: [1, 2] });
        expect(res.status).toBe(400);
        expect(res.body.errors.metadata.msg).toMatch(/object/);
    });

    it('acepta metadata null', async () => {
        const res = await request(app).post('/logs').send({ ...valid, metadata: null });
        expect(res.status).toBe(201);
    });

    it('devuelve el formato de error { status, errors }', async () => {
        const res = await request(app).post('/logs').send({});
        expect(res.status).toBe(400);
        expect(res.body.status).toBe('error');
        expect(typeof res.body.errors).toBe('object');
    });
});

/**
 * Casos frontera que el servidor trata de una forma concreta y este middleware
 * llegó a tratar de otra: aceptaba lo que el servidor rechaza y rechazaba lo
 * que el servidor acepta. Si alguno vuelve a fallar, las dos copias del
 * contrato se han separado otra vez.
 */
describe('paridad con el validador del servidor', () => {
    const base = { application: 'app-x', level: 'error', environment: 'production' };

    describe('objeto error', () => {
        it('lo reparte en campos planos y toma su message si no hay ninguno', async () => {
            const res = await request(app).post('/logs').send({
                ...base,
                error: { name: 'TypeError', message: 'boom', code: 'ECONNRESET', stack: 'a\nb' },
            });
            expect(res.status).toBe(201);
            expect(res.body.body).toMatchObject({
                message: 'boom',
                errorName: 'TypeError',
                errorCode: 'ECONNRESET',
                errorStack: 'a\nb',
            });
        });

        it('no pisa los campos planos que ya venían puestos', async () => {
            const res = await request(app).post('/logs').send({
                ...base,
                message: 'Fallo al facturar',
                errorName: 'MiError',
                error: { name: 'TypeError', message: 'boom' },
            });
            expect(res.status).toBe(201);
            expect(res.body.body).toMatchObject({ message: 'Fallo al facturar', errorName: 'MiError' });
        });

        it('une el stack cuando llega como array de marcos (NetSuite)', async () => {
            const res = await request(app).post('/logs').send({
                ...base,
                error: { message: 'boom', stack: ['marco 1', 'marco 2'] },
            });
            expect(res.status).toBe(201);
            expect(res.body.body.errorStack).toBe('marco 1\nmarco 2');
        });

        it('convierte un code numérico a cadena', async () => {
            const res = await request(app).post('/logs').send({
                ...base,
                error: { message: 'boom', code: 500 },
            });
            expect(res.status).toBe(201);
            expect(res.body.body.errorCode).toBe('500');
        });

        it('descarta el objeto error una vez volcado', async () => {
            const res = await request(app).post('/logs').send({
                ...base,
                error: { message: 'boom' },
            });
            expect(res.status).toBe(201);
            expect(res.body.body).not.toHaveProperty('error');
        });

        it('ignora un error que no sea objeto sin romper', async () => {
            const res = await request(app)
                .post('/logs')
                .send({ ...base, message: 'm', error: 'texto suelto' });
            expect(res.status).toBe(201);
        });
    });

    describe('campos estructurados de error', () => {
        it('acepta errorName, errorCode, errorStack y fingerprint', async () => {
            const res = await request(app).post('/logs').send({
                ...base,
                message: 'm',
                errorName: 'TypeError',
                errorCode: 'E42',
                errorStack: 'x'.repeat(100),
                fingerprint: 'a'.repeat(64),
            });
            expect(res.status).toBe(201);
        });

        it('rechaza un fingerprint de más de 64 chars', async () => {
            const res = await request(app)
                .post('/logs')
                .send({ ...base, message: 'm', fingerprint: 'a'.repeat(65) });
            expect(res.status).toBe(400);
            expect(res.body.errors).toHaveProperty('fingerprint');
        });
    });

    /**
     * Rechazar un stack o un mensaje demasiado largos tumbaba el lote entero,
     * y justo con los errores más aparatosos. Se recortan y se anota cuánto
     * medían, para que quien investigue sepa que están incompletos.
     */
    describe('recorte de campos largos', () => {
        it.each([
            ['message', 100000],
            ['errorStack', 50000],
            ['errorName', 200],
            ['errorCode', 100],
        ])('recorta %s a su tope en vez de rechazarlo', async (field, max) => {
            const res = await request(app)
                .post('/logs')
                .send({ ...base, message: 'm', [field as string]: 'x'.repeat((max as number) + 1) });
            expect(res.status).toBe(201);

            const value = res.body.body[field as string] as string;
            expect(value).toHaveLength(max as number);
            expect(value.endsWith('…')).toBe(true);
            expect(res.body.body.metadata.mclogTruncated).toEqual({ [field as string]: (max as number) + 1 });
        });

        it('deja intacto lo que cabe justo en el tope', async () => {
            const res = await request(app)
                .post('/logs')
                .send({ ...base, message: 'm', errorStack: 'x'.repeat(50000) });
            expect(res.status).toBe(201);
            expect(res.body.body.errorStack).toBe('x'.repeat(50000));
            expect(res.body.body.metadata).toBeUndefined();
        });

        it('conserva la metadata del emisor al anotar el recorte', async () => {
            const res = await request(app)
                .post('/logs')
                .send({ ...base, message: 'm', errorStack: 'x'.repeat(60000), metadata: { pedido: 7 } });
            expect(res.body.body.metadata).toEqual({ pedido: 7, mclogTruncated: { errorStack: 60000 } });
        });

        it('recorta también el stack que llega dentro del objeto error', async () => {
            const res = await request(app)
                .post('/logs')
                .send({ ...base, error: { message: 'boom', stack: 'x'.repeat(60000) } });
            expect(res.status).toBe(201);
            expect(res.body.body.errorStack).toHaveLength(50000);
        });

        it('no parte un emoji por la mitad', async () => {
            // Cada emoji ocupa dos unidades, así que el corte en la 99 999 cae
            // entre las dos mitades de uno.
            const res = await request(app)
                .post('/logs')
                .send({ ...base, message: '😀'.repeat(50001) });
            const value = res.body.body.message as string;
            const antesDeLaElipsis = value.charCodeAt(value.length - 2);
            expect(antesDeLaElipsis >= 0xd800 && antesDeLaElipsis <= 0xdbff).toBe(false);
            expect(value.length).toBeLessThanOrEqual(100000);
        });

        it('sigue rechazando una metadata que no sea objeto', async () => {
            const res = await request(app)
                .post('/logs')
                .send({ ...base, message: 'x'.repeat(100001), metadata: [1, 2] });
            expect(res.status).toBe(400);
            expect(res.body.errors).toHaveProperty('metadata');
        });
    });

    describe('límites de longitud y formato', () => {
        it('rechaza un timestamp que no sea ISO-8601', async () => {
            const res = await request(app)
                .post('/logs')
                .send({ ...base, message: 'm', timestamp: 'no-es-fecha' });
            expect(res.status).toBe(400);
            expect(res.body.errors).toHaveProperty('timestamp');
        });

        it('acepta un timestamp ISO-8601', async () => {
            const res = await request(app)
                .post('/logs')
                .send({ ...base, message: 'm', timestamp: '2026-09-20T12:00:00.000Z' });
            expect(res.status).toBe(201);
        });

        it.each([
            ['service', 121],
            ['host', 256],
            ['traceId', 129],
            ['spanId', 129],
        ])('rechaza %s por encima de su tope', async (field, length) => {
            const res = await request(app)
                .post('/logs')
                .send({ ...base, message: 'm', [field as string]: 'x'.repeat(length as number) });
            expect(res.status).toBe(400);
            expect(res.body.errors).toHaveProperty(field as string);
        });
    });
});

describe('validateLogBatch', () => {
    const entry = { application: 'app-x', level: 'info', environment: 'production', message: 'hola' };

    it('acepta un lote válido', async () => {
        const res = await request(app).post('/logs/batch').send({ logs: [entry, entry] });
        expect(res.status).toBe(201);
    });

    it('una entrada con el stack desmesurado no tumba el lote', async () => {
        const grande = { ...entry, level: 'error', errorStack: 'x'.repeat(80000) };
        const res = await request(app).post('/logs/batch').send({ logs: [entry, grande, entry] });

        expect(res.status).toBe(201);
        expect(res.body.body.logs).toHaveLength(3);
        expect(res.body.body.logs[1].errorStack).toHaveLength(50000);
        expect(res.body.body.logs[1].metadata.mclogTruncated).toEqual({ errorStack: 80000 });
        expect(res.body.body.logs[0].metadata).toBeUndefined();
    });

    it('rechaza un lote vacío', async () => {
        const res = await request(app).post('/logs/batch').send({ logs: [] });
        expect(res.status).toBe(400);
        expect(res.body.errors).toHaveProperty('logs');
    });

    it('rechaza si logs no es un array', async () => {
        const res = await request(app).post('/logs/batch').send({ logs: 'no' });
        expect(res.status).toBe(400);
    });

    it('valida cada entrada del lote y señala su índice', async () => {
        const res = await request(app)
            .post('/logs/batch')
            .send({ logs: [entry, { ...entry, level: 'critico' }] });
        expect(res.status).toBe(400);
        expect(res.body.errors).toHaveProperty('logs[1].level');
    });

    it('reparte el objeto error de cada entrada del lote', async () => {
        const res = await request(app)
            .post('/logs/batch')
            .send({
                logs: [
                    {
                        application: 'app-x',
                        level: 'error',
                        environment: 'production',
                        error: { name: 'TypeError', message: 'boom' },
                    },
                ],
            });
        expect(res.status).toBe(201);
        expect(res.body.body.logs[0]).toMatchObject({ message: 'boom', errorName: 'TypeError' });
    });
});
