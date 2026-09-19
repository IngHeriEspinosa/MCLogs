import express from 'express';
import { getLog, getLogs, log, logBatch, purgeLogs, stats } from '../controllers/logController';
import { validateLog, validateLogBatch } from '../middlewares/validateLog';
import { validateLogDelete, validateLogQuery } from '../middlewares/validateLogQuery';
import { requireApiKeyOrJwt } from '../middlewares/authApiKey';
import { requireAuth } from '../middlewares/requireAuth';
import { requireRole } from '../middlewares/requireRole';
import { ingestLimiter, queryLimiter } from '../middlewares/rateLimiters';

const router = express.Router();

// Ingesta: API key (máquina-a-máquina, p. ej. NetSuite) o JWT
router.post('/log', ingestLimiter, requireApiKeyOrJwt, validateLog, log);
router.post('/logs/batch', ingestLimiter, requireApiKeyOrJwt, validateLogBatch, logBatch);

// Consulta y administración: solo JWT (usuarios del dashboard)
router.get('/logs', queryLimiter, requireAuth, validateLogQuery, getLogs);
router.get('/logs/stats', queryLimiter, requireAuth, stats);
router.get('/logs/:id', queryLimiter, requireAuth, getLog);
router.delete('/logs', queryLimiter, requireAuth, requireRole('admin'), validateLogDelete, purgeLogs);

export default router;
