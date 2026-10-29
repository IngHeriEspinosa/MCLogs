import express from 'express';
import { otlpLogs, otlpToBatch } from '../controllers/otlpController';
import { requireIngest } from '../middlewares/authApiKey';
import { ingestLimiter } from '../middlewares/rateLimiters';
import { validateLogBatch } from '../middlewares/validateLog';
import { requireIngestWorkspace } from '../middlewares/workspaceContext';

const router = express.Router();

// OTLP/HTTP JSON: la misma autenticacion y el mismo limite que la ingesta
// propia (API key "ingest" en x-api-key o Authorization: Bearer). Lo traducido
// pasa por las mismas reglas que un lote de /api/logs/batch.
router.post('/logs', ingestLimiter, requireIngest, requireIngestWorkspace, otlpToBatch, validateLogBatch, otlpLogs);

export default router;
