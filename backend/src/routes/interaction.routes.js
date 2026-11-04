import { Router } from 'express';
import { requireAuth } from '../middleware/auth.middleware.js';
import {
  getPublicProfile,
  likeProfile,
  unlikeProfile,
  blockProfile,
  unblockProfile,
  reportProfile,
  getLikedBy,
  getViewers,
  getConnections
} from '../controllers/interaction.controller.js';

// Mounted at /api/profiles (after browse.routes.js so /suggestions and /search win).
const router = Router();

router.get('/:id', requireAuth, getPublicProfile);
router.post('/:id/like', requireAuth, likeProfile);
router.delete('/:id/like', requireAuth, unlikeProfile);
router.post('/:id/block', requireAuth, blockProfile);
router.delete('/:id/block', requireAuth, unblockProfile);
router.post('/:id/report', requireAuth, reportProfile);

export default router;

// Mounted at /api/interactions.
export const interactionsRouter = Router();
interactionsRouter.get('/likes-received', requireAuth, getLikedBy);
interactionsRouter.get('/views', requireAuth, getViewers);
interactionsRouter.get('/connections', requireAuth, getConnections);
