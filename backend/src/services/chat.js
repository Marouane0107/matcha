import { pool } from '../config/db.js';
import { fail, fields, uuid, pagination, paged } from '../utils/http.util.js';
import { profile, blocked, transaction, lockPair, iso } from './profile.js';
import { mutual } from './social.js';
import { createNotification, publish } from './notifications.js';
import { deliver } from './events.js';

export const messageDTO = row => ({ id: row.id, senderId: row.sender_id, receiverId: row.receiver_id, clientMessageId: row.client_message_id, content: row.content, createdAt: iso(row.created_at) });
export async function permitted(actor, other, client = pool) {
  if (!uuid(other)) fail();
  if (actor === other) fail('MESSAGE_NOT_ALLOWED', 403);
  if (!(await client.query('SELECT id FROM users WHERE id=$1 AND is_verified', [other])).rowCount) fail('PROFILE_NOT_FOUND', 404);
  if (await blocked(actor, other, client)) fail('USER_BLOCKED', 403);
  if (!await mutual(actor, other, client)) fail('NOT_CONNECTED', 403);
}
export async function sendMessage(session, body) {
  fields(body, ['receiverId', 'clientMessageId', 'content'], ['receiverId', 'clientMessageId', 'content']);
  if (!uuid(body.receiverId) || !uuid(body.clientMessageId) || typeof body.content !== 'string') fail();
  const content = body.content.trim();
  if (![...content].length || [...content].length > 2000) fail();
  const result = await transaction(async client => {
    await lockPair(client, session.id, body.receiverId);
    const user = (await client.query('SELECT is_verified,token_version FROM users WHERE id=$1', [session.id])).rows[0];
    if (!user || user.token_version !== session.version || session.exp * 1000 <= Date.now()) fail('UNAUTHORIZED', 401);
    if (!user.is_verified) fail('EMAIL_NOT_VERIFIED', 403);
    await permitted(session.id, body.receiverId, client);
    const previous = (await client.query('SELECT * FROM messages WHERE sender_id=$1 AND client_message_id=$2', [session.id, body.clientMessageId])).rows[0];
    if (previous) {
      if (previous.receiver_id !== body.receiverId || previous.content !== content) fail();
      return { message: messageDTO(previous), notice: null, duplicate: true };
    }
    const row = (await client.query('INSERT INTO messages(sender_id,receiver_id,client_message_id,content) VALUES($1,$2,$3,$4) RETURNING *', [session.id, body.receiverId, body.clientMessageId, content])).rows[0];
    return { message: messageDTO(row), notice: await createNotification(client, body.receiverId, session.id, 'MESSAGE', row.id), duplicate: false };
  });
  if (!result.duplicate) {
    deliver(session.id, 'chat:message', { message: result.message });
    deliver(body.receiverId, 'chat:message', { message: result.message });
    publish(result.notice);
  }
  return result.message;
}
export async function history(actor, other, query) {
  const page = pagination(query);
  return transaction(async client => {
    await lockPair(client, actor, other); await permitted(actor, other, client);
    const where = '(sender_id=$1 AND receiver_id=$2) OR (sender_id=$2 AND receiver_id=$1)';
    const total = (await client.query(`SELECT count(*)::int AS total FROM messages WHERE ${where}`, [actor, other])).rows[0].total;
    const rows = (await client.query(`SELECT * FROM messages WHERE ${where} ORDER BY created_at DESC,id DESC LIMIT $3 OFFSET $4`, [actor, other, page.limit, (page.page - 1) * page.limit])).rows;
    return paged(rows.map(messageDTO), total, page);
  });
}
export async function conversations(actor, query) {
  const page = pagination(query);
  const source = `FROM likes first_like JOIN likes second_like ON second_like.liker_id=first_like.liked_id AND second_like.liked_id=first_like.liker_id
    JOIN users u ON u.id=first_like.liked_id
    LEFT JOIN LATERAL(SELECT * FROM messages WHERE (sender_id=$1 AND receiver_id=u.id) OR (sender_id=u.id AND receiver_id=$1) ORDER BY created_at DESC,id DESC LIMIT 1) last ON true
    WHERE first_like.liker_id=$1 AND u.is_verified AND NOT EXISTS(SELECT 1 FROM blocks WHERE (blocker_id=$1 AND blocked_id=u.id) OR (blocker_id=u.id AND blocked_id=$1))`;
  const total = (await pool.query(`SELECT count(*)::int AS total ${source}`, [actor])).rows[0].total;
  const rows = (await pool.query(`SELECT u.id AS other,GREATEST(first_like.created_at,second_like.created_at) AS connected_at,row_to_json(last) AS last ${source}
    ORDER BY COALESCE(last.created_at,GREATEST(first_like.created_at,second_like.created_at)) DESC,u.id DESC LIMIT $2 OFFSET $3`, [actor, page.limit, (page.page - 1) * page.limit])).rows;
  return paged(await Promise.all(rows.map(async row => ({ user: await profile(row.other, actor), connectedAt: iso(row.connected_at), lastMessage: row.last?.id ? messageDTO(row.last) : null }))), total, page);
}