import { describe, it, expect } from 'vitest';
import express from 'express';
import request from 'supertest';
import { validateLog } from '../src/express';

const app = express();
app.use(express.json());
app.post('/logs', ...validateLog, (_req, res) => {
    res.status(201).json({ ok: true });
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
