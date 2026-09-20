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

        it('rechaza un errorStack de más de 50000 chars', async () => {
            const res = await request(app)
                .post('/logs')
                .send({ ...base, message: 'm', errorStack: 'x'.repeat(50001) });
            expect(res.status).toBe(400);
            expect(res.body.errors).toHaveProperty('errorStack');
        });

        it('rechaza un fingerprint de más de 64 chars', async () => {
            const res = await request(app)
                .post('/logs')
                .send({ ...base, message: 'm', fingerprint: 'a'.repeat(65) });
            expect(res.status).toBe(400);
            expect(res.body.errors).toHaveProperty('fingerprint');
        });

        it('rechaza un errorName de más de 200 chars', async () => {
            const res = await request(app)
                .post('/logs')
                .send({ ...base, message: 'm', errorName: 'x'.repeat(201) });
            expect(res.status).toBe(400);
            expect(res.body.errors).toHaveProperty('errorName');
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
            ['message', 100001],
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
