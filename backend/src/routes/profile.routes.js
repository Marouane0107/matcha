import { Router } from 'express';
import { requireAuth } from '../middleware/auth.middleware.js';
import { uploadPhotoMiddleware } from '../middleware/upload.middleware.js';
import { profile, update } from '../services/profile.js';
import { updateLocation } from '../services/location.js';
import * as pictures from '../services/pictures.js';
import { route, send } from '../utils/http.util.js';
import { pool } from '../config/db.js';

const router = Router();

// Profile endpoints — mounted at /api/profile
router.get('/me', requireAuth, route(async (req, res) => send(res, await profile(req.user.id))));
router.patch('/me', requireAuth, route(async (req, res) => send(res, await update(req.user.id, req.body))));
router.patch('/location', requireAuth, route(async (req, res) => send(res, await updateLocation(req.user.id, req.body))));

// Picture endpoints — match shared contract paths
router.post('/pictures', requireAuth, uploadPhotoMiddleware, route(async (req, res) => send(res, await pictures.upload(req.user.id, req.file), 201)));
router.get('/pictures/:id', requireAuth, route(async (req, res) => { res.set({ 'Content-Type': 'image/webp', 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' }); res.send(await pictures.read(req.params.id, req.user.id)); }));
router.delete('/pictures/:id', requireAuth, route(async (req, res) => send(res, await pictures.mutate(req.params.id, req.user.id, true))));
router.patch('/pictures/:id/main', requireAuth, route(async (req, res) => send(res, await pictures.mutate(req.params.id, req.user.id))));

export default router;

// Dedicated router for mounting directly at /api/tags
export const tagRouter = Router();
tagRouter.get('/', requireAuth, route(async (_req, res) => send(res, (await pool.query('SELECT id,name FROM tags ORDER BY name,id')).rows)));
