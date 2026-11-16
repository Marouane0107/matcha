/**
 * Browse Routes — mounted at /api/profiles
 *
 * GET /api/profiles/suggestions  → Suggested profiles engine
 * GET /api/profiles/search       → Advanced multi-criteria search
 */

import { Router } from 'express';
import { requireAuth } from '../middleware/auth.middleware.js';
import { discover } from '../services/discovery.js';
import { route, send } from '../utils/http.util.js';

const router = Router();

router.get('/suggestions', requireAuth, route(async (req, res) => send(res, await discover(req.user.id, req.query, true))));
router.get('/search', requireAuth, route(async (req, res) => send(res, await discover(req.user.id, req.query))));

export default router;
