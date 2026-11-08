import { Router } from 'express';
import { requireAuth } from '../middleware/auth.middleware.js';
import { getConversations, getMessages } from '../controllers/chat.controller.js';

const router = Router();

router.get('/', requireAuth, getConversations);
router.get('/:userId/messages', requireAuth, getMessages);

export default router;
