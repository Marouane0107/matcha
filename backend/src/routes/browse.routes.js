/**
 * Browse Routes — mounted at /api/profiles
 *
 * GET /api/profiles/suggestions  → Suggested profiles engine
 * GET /api/profiles/search       → Advanced multi-criteria search
 */

import { Router } from 'express';
import { requireAuth } from '../middleware/auth.middleware.js';
import { getSuggestions, searchProfiles } from '../controllers/browse.controller.js';

const router = Router();

router.get('/suggestions', requireAuth, getSuggestions);
router.get('/search',      requireAuth, searchProfiles);

export default router;
