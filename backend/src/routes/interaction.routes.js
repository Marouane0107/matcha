import { Router } from 'express';
import { requireAuth } from '../middleware/auth.middleware.js';
import * as social from '../services/social.js';
import { publicByUsername } from '../services/profile.js';
import { route, send } from '../utils/http.util.js';

// Mounted at /api/profiles (after browse.routes.js so /suggestions and /search win).
const router = Router();

router.get('/:username', requireAuth, route(async (req, res) => send(res, await publicByUsername(req.params.username, req.user.id))));
router.post('/:id/like', requireAuth, route(async (req, res) => send(res, await social.like(req.user.id, req.params.id), 201)));
router.delete('/:id/like', requireAuth, route(async (req, res) => send(res, await social.like(req.user.id, req.params.id, true))));
router.post('/:id/view', requireAuth, route(async (req, res) => send(res, await social.visit(req.user.id, req.params.id), 201)));
router.post('/:id/block', requireAuth, route(async (req, res) => { const result = await social.block(req.user.id, req.params.id); send(res, result.value, result.existed ? 200 : 201); }));
router.delete('/:id/block', requireAuth, route(async (req, res) => { await social.block(req.user.id, req.params.id, true); res.status(204).end(); }));
router.post('/:id/report', requireAuth, route(async (req, res) => send(res, await social.report(req.user.id, req.params.id, req.body), 201)));

export default router;

// Mounted at /api/interactions.
export const interactionsRouter = Router();
interactionsRouter.get('/likes-received', requireAuth, route(async (req, res) => send(res, await social.relationships(req.user.id, 'likes', req.query))));
interactionsRouter.get('/views', requireAuth, route(async (req, res) => send(res, await social.relationships(req.user.id, 'views', req.query))));
interactionsRouter.get('/connections', requireAuth, route(async (req, res) => send(res, await social.relationships(req.user.id, 'connections', req.query))));
