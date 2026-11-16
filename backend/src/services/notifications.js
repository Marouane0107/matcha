import { pool } from '../config/db.js';
import { fail, pagination, paged, uuid } from '../utils/http.util.js';
import { iso, blocked } from './profile.js';
import { deliver } from './events.js';

const visible = `NOT EXISTS(SELECT 1 FROM blocks b WHERE (b.blocker_id=n.user_id AND b.blocked_id=n.sender_id) OR (b.blocker_id=n.sender_id AND b.blocked_id=n.user_id))`;
function dto(row) {
  return { id: row.id, type: row.type, actorId: row.sender_id, actorUsername: row.username ?? null, read: row.is_read, createdAt: iso(row.created_at), metadata: row.sender_id && row.message_id ? { messageId: row.message_id } : {} };
}
export async function createNotification(client, userId, actorId, type, messageId = null) {
  if (userId === actorId && type !== 'CONNECTION' || await blocked(userId, actorId, client)) return null;
  const row = (await client.query('INSERT INTO notifications(user_id,sender_id,type,message_id) VALUES($1,$2,$3,$4) RETURNING *', [userId, actorId, type, messageId])).rows[0];
  row.username = (await client.query('SELECT username FROM users WHERE id=$1', [actorId])).rows[0]?.username ?? null;
  return { userId, notification: dto(row) };
}
export function publish(notice) { if (notice) deliver(notice.userId, 'notification:new', notice.notification); }
export async function unread(id, client = pool) {
  return { unreadCount: (await client.query(`SELECT count(*)::int AS count FROM notifications n WHERE n.user_id=$1 AND NOT n.is_read AND ${visible}`, [id])).rows[0].count };
}
export async function list(id, query) {
  const page = pagination(query);
  const total = (await pool.query(`SELECT count(*)::int AS total FROM notifications n WHERE n.user_id=$1 AND ${visible}`, [id])).rows[0].total;
  const rows = (await pool.query(`SELECT n.*,u.username FROM notifications n LEFT JOIN users u ON u.id=n.sender_id WHERE n.user_id=$1 AND ${visible} ORDER BY n.created_at DESC,n.id DESC LIMIT $2 OFFSET $3`, [id, page.limit, (page.page - 1) * page.limit])).rows;
  return paged(rows.map(dto), total, page);
}
export async function read(id, notificationId) {
  if (!uuid(notificationId)) fail();
  const result = await pool.query(`UPDATE notifications n SET is_read=true WHERE n.id=$1 AND n.user_id=$2 AND ${visible} RETURNING n.id`, [notificationId, id]);
  if (!result.rowCount) fail('NOT_FOUND', 404);
  return { notificationId, read: true, ...await unread(id) };
}
export async function readAll(id) {
  const result = await pool.query(`UPDATE notifications n SET is_read=true WHERE n.user_id=$1 AND NOT n.is_read AND ${visible}`, [id]);
  return { updatedCount: result.rowCount, ...await unread(id) };
}