import express from 'express';
import { getLog, getLogs, log, logBatch, purgeLogs, stats } from '../controllers/logController';
import { validateLog, validateLogBatch } from '../middlewares/validateLog';
import { validateLogDelete, validateLogQuery } from '../middlewares/validateLogQuery';
import { requireAuthOrReadKey, requireIngest } from '../middlewares/authApiKey';
import { requireAuth } from '../middlewares/requireAuth';
import { requireRole } from '../middlewares/requireRole';
import { ingestLimiter, queryLimiter } from '../middlewares/rateLimiters';

const router = express.Router();

// Ingesta: API key con scope "ingest" (maquina-a-maquina, p. ej. NetSuite) o JWT
router.post('/log', ingestLimiter, requireIngest, validateLog, log);
router.post('/logs/batch', ingestLimiter, requireIngest, validateLogBatch, logBatch);

// Consulta: JWT de usuario o API key con scope "read"
router.get('/logs', queryLimiter, requireAuthOrReadKey, validateLogQuery, getLogs);
router.get('/logs/stats', queryLimiter, requireAuthOrReadKey, stats);
router.get('/logs/:id', queryLimiter, requireAuthOrReadKey, getLog);

// Administracion: solo usuarios con rol admin. Una API key nunca puede purgar.
router.delete('/logs', queryLimiter, requireAuth, requireRole('admin'), validateLogDelete, purgeLogs);

export default router;
