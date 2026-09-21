import express from 'express';
import { getLog, getLogs, log, logBatch, purgeLogs, stats } from '../controllers/logController';
import { applications, errorGroups, logContext, trace } from '../controllers/analysisController';
import { streamLogs } from '../controllers/streamController';
import { validateLog, validateLogBatch } from '../middlewares/validateLog';
import {
    validateApplications,
    validateErrorGroups,
    validateLogContext,
    validateLogDelete,
    validateLogQuery,
    validateStatsQuery,
    validateTrace
} from '../middlewares/validateLogQuery';
import { requireAuthOrReadKey, requireIngest } from '../middlewares/authApiKey';
import { requireAuth } from '../middlewares/requireAuth';
import { requireRole } from '../middlewares/requireRole';
import { ingestLimiter, queryLimiter } from '../middlewares/rateLimiters';

const router = express.Router();

// Ingesta: API key con scope "ingest" (maquina-a-maquina, p. ej. NetSuite) o JWT
router.post('/log', ingestLimiter, requireIngest, validateLog, log);
router.post('/logs/batch', ingestLimiter, requireIngest, validateLogBatch, logBatch);

// Consulta y analisis: JWT de usuario o API key con scope "read".
//
// Las rutas con segmento fijo van ANTES que /logs/:id: si no, Express tomaria
// "stats" o "applications" como si fueran un id.
router.get('/logs/stats', queryLimiter, requireAuthOrReadKey, validateStatsQuery, stats);
router.get('/logs/applications', queryLimiter, requireAuthOrReadKey, validateApplications, applications);
// Stream en vivo (SSE). Sin queryLimiter: es una conexion larga, no una rafaga
// de peticiones, y su tope propio es SSE_MAX_CONNECTIONS.
router.get('/logs/stream', requireAuthOrReadKey, streamLogs);
router.get('/logs/errors/groups', queryLimiter, requireAuthOrReadKey, validateErrorGroups, errorGroups);
router.get('/logs/trace/:traceId', queryLimiter, requireAuthOrReadKey, validateTrace, trace);
router.get('/logs/:id/context', queryLimiter, requireAuthOrReadKey, validateLogContext, logContext);

router.get('/logs', queryLimiter, requireAuthOrReadKey, validateLogQuery, getLogs);
router.get('/logs/:id', queryLimiter, requireAuthOrReadKey, getLog);

// Administracion: solo usuarios con rol admin. Una API key nunca puede purgar.
router.delete('/logs', queryLimiter, requireAuth, requireRole('admin'), validateLogDelete, purgeLogs);

export default router;
