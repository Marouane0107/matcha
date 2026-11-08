import { Router } from 'express';
import { requireAuth } from '../middleware/auth.middleware.js';
import { listNotifications, unreadCount, markRead, markAllRead } from '../controllers/notification.controller.js';

const router = Router();

router.get('/unread-count', requireAuth, unreadCount);
router.patch('/read-all', requireAuth, markAllRead);
router.get('/', requireAuth, listNotifications);
router.patch('/:notificationId/read', requireAuth, markRead);

export default router;
