import { verifyToken } from '../utils/jwt.util.js';
import { pool } from '../config/db.js';
import { SOCKET_EVENTS, ERROR_CODES, apiError } from '../config/shared.js';
import { setIO } from './registry.js';
import { addSocket, removeSocket } from './presence.js';
import { createRateLimiter } from '../utils/rate-limit.js';
import { createNotification, emitNotification, emitToUser } from '../utils/notification.util.js';
import { buildChatMessage } from '../utils/chat.util.js';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const sendLimiter = createRateLimiter(60000);
const readLimiter = createRateLimiter(60000);
const onlineLimiter = createRateLimiter(60000);

function authError(code, message) {
  /** @type {Error & { data?: unknown }} */
  const err = new Error(message);
  err.data = { code, message };
  return err;
}

function ack(callback, code, message) {
  if (typeof callback === 'function') callback(apiError(code, message));
}

async function getUserConnections(userId) {
  const result = await pool.query(
    `SELECT l.liked_id AS id
     FROM likes l
     JOIN likes l2 ON l2.liker_id = l.liked_id AND l2.liked_id = l.liker_id
     WHERE l.liker_id = $1::uuid
       AND NOT EXISTS (
         SELECT 1 FROM blocks b
         WHERE (b.blocker_id = $1::uuid AND b.blocked_id = l.liked_id)
            OR (b.blocker_id = l.liked_id AND b.blocked_id = $1::uuid)
       )`,
    [userId]
  );
  return result.rows.map(row => row.id);
}

async function broadcastPresence(io, userId, isOnline, lastSeen) {
  const connectionIds = await getUserConnections(userId);
  const payload = { userId, isOnline, lastSeen };
  for (const otherId of connectionIds) {
    io.to(`user:${otherId}`).emit(SOCKET_EVENTS.USER_STATUS, payload);
  }
}

async function handleChatSend(socket, userId, payload, callback) {
  try {
    if (!sendLimiter(`send:${userId}`, 30)) return ack(callback, ERROR_CODES.RATE_LIMITED, 'Rate limited');
    if (typeof callback !== 'function') return;

    const { receiverId, clientMessageId, content } = payload ?? {};
    if (!UUID_RE.test(receiverId ?? '') || !UUID_RE.test(clientMessageId ?? '') || typeof content !== 'string') {
      return ack(callback, ERROR_CODES.VALIDATION_ERROR, 'Invalid message payload');
    }
    const text = content.trim();
    if ([...text].length < 1 || [...text].length > 2000) {
      return ack(callback, ERROR_CODES.VALIDATION_ERROR, 'Message must be 1 to 2000 characters');
    }
    if (receiverId === userId) return ack(callback, ERROR_CODES.MESSAGE_NOT_ALLOWED, 'Cannot message yourself');

    const receiver = await pool.query('SELECT id FROM users WHERE id = $1::uuid', [receiverId]);
    if (receiver.rows.length === 0) return ack(callback, ERROR_CODES.PROFILE_NOT_FOUND, 'Profile not found');

    const blocked = await pool.query(
      `SELECT 1 FROM blocks
       WHERE (blocker_id = $1::uuid AND blocked_id = $2::uuid) OR (blocker_id = $2::uuid AND blocked_id = $1::uuid)
       LIMIT 1`,
      [userId, receiverId]
    );
    if (blocked.rows.length > 0) return ack(callback, ERROR_CODES.USER_BLOCKED, 'Blocked');

    const connected = await pool.query(
      `SELECT 1 FROM likes l1
       JOIN likes l2 ON l2.liker_id = l1.liked_id AND l2.liked_id = l1.liker_id
       WHERE l1.liker_id = $1::uuid AND l1.liked_id = $2::uuid
       LIMIT 1`,
      [userId, receiverId]
    );
    if (connected.rows.length === 0) return ack(callback, ERROR_CODES.NOT_CONNECTED, 'Not connected');

    const existing = await pool.query(
      'SELECT * FROM messages WHERE sender_id = $1::uuid AND client_message_id = $2::uuid',
      [userId, clientMessageId]
    );
    if (existing.rows.length > 0) {
      const prev = existing.rows[0];
      if (prev.receiver_id === receiverId && prev.content === text) {
        return callback({ success: true, data: buildChatMessage(prev), error: null });
      }
      return ack(callback, ERROR_CODES.VALIDATION_ERROR, 'clientMessageId reused with different content');
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const inserted = await client.query(
        `INSERT INTO messages (sender_id, receiver_id, client_message_id, content)
         VALUES ($1::uuid, $2::uuid, $3::uuid, $4)
         RETURNING id, sender_id, receiver_id, client_message_id, content, created_at`,
        [userId, receiverId, clientMessageId, text]
      );
      const message = buildChatMessage(inserted.rows[0]);
      const notification = await createNotification(client, {
        userId: receiverId,
        actorId: userId,
        type: 'MESSAGE',
        metadata: { messageId: message.id },
      });
      await client.query('COMMIT');

      emitToUser(receiverId, SOCKET_EVENTS.CHAT_MESSAGE, { message });
      emitToUser(userId, SOCKET_EVENTS.CHAT_MESSAGE, { message });
      emitNotification(receiverId, notification);
      callback({ success: true, data: message, error: null });
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  } catch (err) {
    console.error('[chat:send]', err);
    ack(callback, ERROR_CODES.INTERNAL_ERROR, 'Internal error');
  }
}

async function handleNotificationRead(userId, payload, callback) {
  try {
    if (!readLimiter(`read:${userId}`, 120)) return ack(callback, ERROR_CODES.RATE_LIMITED, 'Rate limited');
    if (typeof callback !== 'function') return;

    const { notificationId } = payload ?? {};
    if (!UUID_RE.test(notificationId ?? '')) return ack(callback, ERROR_CODES.VALIDATION_ERROR, 'Invalid notification id');

    const updated = await pool.query(
      'UPDATE notifications SET is_read = TRUE WHERE id = $1::uuid AND user_id = $2::uuid RETURNING id',
      [notificationId, userId]
    );
    if (updated.rows.length === 0) return ack(callback, ERROR_CODES.NOT_FOUND, 'Notification not found');

    const unread = await pool.query(
      'SELECT COUNT(*)::int AS c FROM notifications WHERE user_id = $1::uuid AND is_read = FALSE',
      [userId]
    );
    callback({
      success: true,
      data: { notificationId, read: true, unreadCount: unread.rows[0].c },
      error: null,
    });
  } catch (err) {
    console.error('[notification:read]', err);
    ack(callback, ERROR_CODES.INTERNAL_ERROR, 'Internal error');
  }
}

export function initSocketServer(io) {
  setIO(io);

  io.use(async (socket, next) => {
    try {
      const token = socket.handshake?.auth?.accessToken;
      if (typeof token !== 'string' || !token) return next(authError(ERROR_CODES.UNAUTHORIZED, 'Authentication required'));
      const decoded = verifyToken(token);
      const userId = decoded?.id;
      if (typeof userId !== 'string' || !userId) return next(authError(ERROR_CODES.UNAUTHORIZED, 'Invalid or expired token'));
      const user = await pool.query('SELECT is_verified FROM users WHERE id = $1::uuid', [userId]);
      if (user.rows.length === 0 || !user.rows[0].is_verified) {
        return next(authError(ERROR_CODES.EMAIL_NOT_VERIFIED, 'Email not verified'));
      }
      socket.data.userId = userId;
      next();
    } catch {
      next(authError(ERROR_CODES.UNAUTHORIZED, 'Invalid or expired token'));
    }
  });

  io.on('connection', (socket) => {
    const userId = socket.data.userId;
    socket.join(`user:${userId}`);
    const size = addSocket(userId, socket.id);
    if (size === 1) void broadcastPresence(io, userId, true, null).catch(() => {});

    socket.on(SOCKET_EVENTS.USER_ONLINE, (payload, callback) => {
      if (!onlineLimiter(`online:${userId}`, 12)) return ack(callback, ERROR_CODES.RATE_LIMITED, 'Rate limited');
      if (typeof callback !== 'function') return;
      callback({ success: true, data: { userId, isOnline: true, lastSeen: null }, error: null });
    });

    socket.on(SOCKET_EVENTS.NOTIFICATION_READ, (payload, callback) => {
      void handleNotificationRead(userId, payload, callback);
    });

    socket.on(SOCKET_EVENTS.CHAT_SEND, (payload, callback) => {
      void handleChatSend(socket, userId, payload, callback);
    });

    socket.on('disconnect', () => {
      const remaining = removeSocket(userId, socket.id);
      if (remaining === 0) {
        const lastSeen = new Date().toISOString();
        pool.query('UPDATE users SET last_seen = NOW() WHERE id = $1::uuid', [userId]).catch(() => {});
        void broadcastPresence(io, userId, false, lastSeen).catch(() => {});
      }
    });
  });
}
