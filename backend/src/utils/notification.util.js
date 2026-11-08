import { SOCKET_EVENTS } from '../config/shared.js';
import { getIO } from '../sockets/registry.js';

export function mapNotificationRow(row) {
  return {
    id: row.id,
    type: row.type,
    actorId: row.sender_id ?? null,
    actorUsername: row.actor_username ?? null,
    read: row.is_read,
    createdAt: new Date(row.created_at).toISOString(),
    metadata: row.metadata ?? {},
  };
}

export async function createNotification(clientOrPool, { userId, actorId = null, type, metadata = {} }) {
  const result = await clientOrPool.query(
    `INSERT INTO notifications (user_id, sender_id, type, metadata)
     VALUES ($1::uuid, $2::uuid, $3, $4::jsonb)
     RETURNING id, sender_id, type, is_read, created_at, metadata`,
    [userId, actorId, type, JSON.stringify(metadata)]
  );
  const row = result.rows[0];
  let actorUsername = null;
  if (row.sender_id) {
    const actor = await clientOrPool.query('SELECT username FROM users WHERE id = $1::uuid', [row.sender_id]);
    actorUsername = actor.rows[0]?.username ?? null;
  }
  return {
    id: row.id,
    type: row.type,
    actorId: row.sender_id ?? null,
    actorUsername,
    read: row.is_read,
    createdAt: new Date(row.created_at).toISOString(),
    metadata: row.metadata ?? {},
  };
}

export function emitToUser(userId, event, payload) {
  const io = getIO();
  if (io) io.to(`user:${userId}`).emit(event, payload);
}

export function emitNotification(userId, notification) {
  emitToUser(userId, SOCKET_EVENTS.NOTIFICATION_NEW, notification);
}
