import express from 'express';
import { getLog, getLogs, log, logBatch, purgeLogs, stats } from '../controllers/logController';
import {
    applications,
    errorGroups,
    latency,
    logContext,
    occurrences,
    releases,
    trace,
    traces,
    updateGroups
} from '../controllers/analysisController';
import { streamLogs } from '../controllers/streamController';
import { validateLog, validateLogBatch } from '../middlewares/validateLog';
import {
    validateApplications,
    validateErrorGroups,
    validateLogContext,
    validateLogDelete,
    validateLogId,
    validateLogQuery,
    validateStatsQuery,
    validateStreamQuery,
    validateTrace,
    validateTraceList,
    validateGroupUpdate
} from '../middlewares/validateLogQuery';
import { requireAuthOrReadKey, requireIngest } from '../middlewares/authApiKey';
import { requireAuth } from '../middlewares/requireAuth';
import { requireIngestWorkspace, requireWorkspace, requireWorkspaceOwner } from '../middlewares/workspaceContext';
import { ingestLimiter, queryLimiter } from '../middlewares/rateLimiters';

const router = express.Router();

// Ingesta: API key con scope "ingest" (maquina-a-maquina, p. ej. NetSuite) o JWT
// del dueño del espacio (laboratorio). El log va al espacio de la clave.
router.post('/log', ingestLimiter, requireIngest, requireIngestWorkspace, validateLog, log);
router.post('/logs/batch', ingestLimiter, requireIngest, requireIngestWorkspace, validateLogBatch, logBatch);

// Consulta y analisis: JWT de usuario o API key con scope "read", siempre
// acotados al espacio de la peticion (requireWorkspace).
//
// Las rutas con segmento fijo van ANTES que /logs/:id: si no, Express tomaria
// "stats" o "applications" como si fueran un id.
router.get('/logs/stats', queryLimiter, requireAuthOrReadKey, requireWorkspace, validateStatsQuery, stats);
router.get('/logs/applications', queryLimiter, requireAuthOrReadKey, requireWorkspace, validateApplications, applications);
// Stream en vivo (SSE). Sin queryLimiter: es una conexion larga, no una rafaga
// de peticiones, y su tope propio es SSE_MAX_CONNECTIONS.
router.get('/logs/stream', requireAuthOrReadKey, requireWorkspace, validateStreamQuery, streamLogs);
router.get('/logs/errors/groups', queryLimiter, requireAuthOrReadKey, requireWorkspace, validateErrorGroups, errorGroups);
router.patch('/logs/errors/groups', queryLimiter, requireAuth, requireWorkspaceOwner, validateGroupUpdate, updateGroups);
router.get('/logs/latency', queryLimiter, requireAuthOrReadKey, requireWorkspace, validateStatsQuery, latency);
router.get('/logs/releases', queryLimiter, requireAuthOrReadKey, requireWorkspace, validateStatsQuery, releases);
router.get('/logs/traces', queryLimiter, requireAuthOrReadKey, requireWorkspace, validateTraceList, traces);
router.get('/logs/trace/:traceId', queryLimiter, requireAuthOrReadKey, requireWorkspace, validateTrace, trace);
router.get('/logs/:id/context', queryLimiter, requireAuthOrReadKey, requireWorkspace, validateLogContext, logContext);
router.get('/logs/:id/occurrences', queryLimiter, requireAuthOrReadKey, requireWorkspace, validateLogId, occurrences);

router.get('/logs', queryLimiter, requireAuthOrReadKey, requireWorkspace, validateLogQuery, getLogs);
router.get('/logs/:id', queryLimiter, requireAuthOrReadKey, requireWorkspace, getLog);

// Purga: solo el dueño del espacio, y solo en su espacio. Una API key nunca puede purgar.
router.delete('/logs', queryLimiter, requireAuth, requireWorkspaceOwner, validateLogDelete, purgeLogs);

export default router;
