import { Router } from 'express';
import { requireAuth } from '../middleware/auth.middleware.js';
import { route, send } from '../utils/http.util.js';
import * as chat from '../services/chat.js';
import * as notifications from '../services/notifications.js';

export const chatRouter = Router();
chatRouter.use(requireAuth);
chatRouter.get('/', route(async (req, res) => send(res, await chat.conversations(req.user.id, req.query))));
chatRouter.get('/:userId/messages', route(async (req, res) => send(res, await chat.history(req.user.id, req.params.userId, req.query))));
export const notificationRouter = Router();
notificationRouter.use(requireAuth);
notificationRouter.get('/', route(async (req, res) => send(res, await notifications.list(req.user.id, req.query))));
notificationRouter.get('/unread-count', route(async (req, res) => send(res, await notifications.unread(req.user.id))));
notificationRouter.patch('/read-all', route(async (req, res) => send(res, await notifications.readAll(req.user.id))));
notificationRouter.patch('/:id/read', route(async (req, res) => send(res, await notifications.read(req.user.id, req.params.id))));