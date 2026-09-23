import express, { RequestHandler } from 'express';
import { body, param, validationResult } from 'express-validator';
import logger from '../config/logger';
import { API_KEY_SCOPES, createApiKey, listApiKeys, revokeApiKey } from '../services/apiKeyService';
import { AuthenticatedRequest, requireAuth } from '../middlewares/requireAuth';
import { requireWorkspaceOwner, workspaceIdOf } from '../middlewares/workspaceContext';
import { queryLimiter } from '../middlewares/rateLimiters';

const router = express.Router();

const handleValidation: RequestHandler = (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        res.status(400).json({ status: 'error', errors: errors.mapped() });
        return;
    }
    next();
};

// Las claves son del espacio activo y solo las gestiona su dueño.
router.use(queryLimiter, requireAuth, requireWorkspaceOwner);

router.get('/', async (req, res) => {
    try {
        res.json({ data: await listApiKeys(workspaceIdOf(req)) });
    } catch (error) {
        logger.error('Error listing API keys', { error });
        res.status(500).json({ error: 'Error listing API keys' });
    }
});

router.post(
    '/',
    [
        body('name').trim().notEmpty().withMessage('name is required').isLength({ max: 120 }),
        body('scopes')
            .isArray({ min: 1 })
            .withMessage(`scopes must be a non-empty array of: ${API_KEY_SCOPES.join(', ')}`),
        body('scopes.*').isIn(API_KEY_SCOPES).withMessage(`scope must be one of: ${API_KEY_SCOPES.join(', ')}`),
        body('applications').optional().isArray().withMessage('applications must be an array'),
        body('applications.*').isString().isLength({ max: 120 }),
        body('expiresAt').optional({ values: 'null' }).isISO8601().withMessage('expiresAt must be ISO-8601').toDate(),
        handleValidation
    ],
    async (req: AuthenticatedRequest, res: express.Response) => {
        try {
            // Se eliminan duplicados para que los scopes no se repitan en la respuesta.
            const scopes = Array.from(new Set(req.body.scopes as string[]));
            const applications = Array.from(new Set((req.body.applications as string[] | undefined) ?? []));
            const result = await createApiKey({
                workspaceId: workspaceIdOf(req),
                name: req.body.name,
                scopes,
                applications,
                expiresAt: (req.body.expiresAt as Date | undefined) ?? null,
                createdById: req.user?.id ?? null
            });
            logger.info('API key created', {
                id: result.apiKey.id,
                name: result.apiKey.name,
                workspaceId: result.apiKey.workspaceId,
                scopes,
                applications,
                by: req.user?.email
            });
            // `key` es la unica vez que el secreto viaja en claro: no se puede recuperar despues.
            res.status(201).json(result);
        } catch (error) {
            logger.error('Error creating API key', { error });
            res.status(500).json({ error: 'Error creating API key' });
        }
    }
);

router.delete(
    '/:id',
    [param('id').isInt({ min: 1 }).withMessage('id must be an integer').toInt(), handleValidation],
    async (req: AuthenticatedRequest, res: express.Response) => {
        try {
            const revoked = await revokeApiKey(Number(req.params.id), workspaceIdOf(req));
            if (!revoked) {
                res.status(404).json({ error: 'API key not found' });
                return;
            }
            logger.info('API key revoked', { id: revoked.id, name: revoked.name, by: req.user?.email });
            res.json({ data: revoked });
        } catch (error) {
            logger.error('Error revoking API key', { error });
            res.status(500).json({ error: 'Error revoking API key' });
        }
    }
);

export default router;
