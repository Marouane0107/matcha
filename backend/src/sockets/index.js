import { apiSuccess, apiError } from '../config/shared.js';
import { SOCKET_EVENTS } from '@matcha/shared';
import { pool } from '../config/db.js';
import { authenticate, revoked } from '../services/session.js';
import { sockets, isOnline } from '../services/presence.js';
import { events, deliver } from '../services/events.js';
import { sendMessage } from '../services/chat.js';
import { read } from '../services/notifications.js';
import { fields, fail } from '../utils/http.util.js';

const limits = new Map();
export function rate(id, action, maximum) {
  const key = `${id}:${action}`, now = Date.now();
  const entry = limits.get(key);
  if (!entry || now >= entry.until) { limits.set(key, { count: 1, until: now + 60000 }); return; }
  if (++entry.count > maximum) fail('RATE_LIMITED', 429);
}
export function attachSockets(io) {
  const sweep = setInterval(() => { for (const [key, value] of limits) if (value.until < Date.now()) limits.delete(key); }, 60000); sweep.unref();
  const broadcast = (id, event, payload) => io.to(`user:${id}`).emit(event, payload);
  const invalidate = id => { for (const socket of sockets.get(id) ?? []) socket.disconnect(true); };
  events.on('deliver', broadcast); revoked.add(invalidate);
  io.use(async (socket, next) => {
    try {
      fields(socket.handshake.auth, ['accessToken'], ['accessToken']);
      if (typeof socket.handshake.auth.accessToken !== 'string' || !socket.handshake.auth.accessToken) fail('UNAUTHORIZED', 401);
      socket.data.session = await authenticate(socket.handshake.auth.accessToken);
      next();
    } catch (error) { next(Object.assign(new Error('Authentication failed'), { data: { code: error.errorCode === 'EMAIL_NOT_VERIFIED' ? 'EMAIL_NOT_VERIFIED' : 'UNAUTHORIZED', message: 'Authentication required' } })); }
  });
  async function status(id) {
    const online = isOnline(id);
    const lastSeen = online ? null : (await pool.query('SELECT last_seen FROM users WHERE id=$1', [id])).rows[0]?.last_seen?.toISOString() ?? null;
    return { userId: id, isOnline: online, lastSeen };
  }
  async function announce(id) {
    const payload = await status(id);
    const peers = (await pool.query(`SELECT l1.liked_id AS id FROM likes l1 JOIN likes l2 ON l2.liker_id=l1.liked_id AND l2.liked_id=l1.liker_id
      WHERE l1.liker_id=$1 AND NOT EXISTS(SELECT 1 FROM blocks WHERE (blocker_id=$1 AND blocked_id=l1.liked_id) OR (blocker_id=l1.liked_id AND blocked_id=$1))`, [id])).rows;
    peers.forEach(peer => deliver(peer.id, SOCKET_EVENTS.USER_STATUS, payload));
  }
  io.on('connection', socket => {
    const session = socket.data.session;
    const id = session.id;
    const group = sockets.get(id) ?? new Set(); group.add(socket); sockets.set(id, group);
    socket.join(`user:${id}`);
    const expiry = setTimeout(() => socket.disconnect(true), Math.max(0, session.exp * 1000 - Date.now())); expiry.unref();
    void announce(id).catch(() => {});
    function handler(event, maximum, action) {
      socket.on(event, async (payload, ack) => {
        if (typeof ack !== 'function') return;
        try {
          await authenticate(socket.handshake.auth.accessToken);
          rate(id, event, maximum);
          ack(apiSuccess(await action(payload)));
        } catch (error) {
          const code = error.errorCode ?? 'INTERNAL_ERROR'; ack(apiError(code, code));
          if (['UNAUTHORIZED', 'EMAIL_NOT_VERIFIED'].includes(code)) socket.disconnect(true);
        }
      });
    }
    handler(SOCKET_EVENTS.CHAT_SEND, 30, payload => sendMessage(session, payload));
    handler(SOCKET_EVENTS.NOTIFICATION_READ, 120, payload => { fields(payload, ['notificationId'], ['notificationId']); return read(id, payload.notificationId); });
    handler(SOCKET_EVENTS.USER_ONLINE, 12, async payload => { fields(payload, []); return status(id); });
    socket.on('disconnect', () => {
      clearTimeout(expiry); group.delete(socket);
      if (!group.size) {
        sockets.delete(id);
        void pool.query('UPDATE users SET last_seen=NOW() WHERE id=$1', [id]).then(() => announce(id)).catch(() => {});
      }
    });
  });
  io.httpServer.once('close', () => { clearInterval(sweep); events.off('deliver', broadcast); revoked.delete(invalidate); });
}