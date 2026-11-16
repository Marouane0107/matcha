import { pool } from '../config/db.js';
import { fail, uuid, pagination, paged, fields, text } from '../utils/http.util.js';
import { transaction, lockPair, profile, blocked, iso } from './profile.js';
import { createNotification, publish } from './notifications.js';
import { deliver } from './events.js';

async function targetExists(client, id) {
  if (!(await client.query('SELECT id FROM users WHERE id=$1 AND is_verified', [id])).rowCount) fail('PROFILE_NOT_FOUND', 404);
}
export async function mutual(first, second, client = pool) {
  return (await client.query('SELECT count(*)::int AS count FROM likes WHERE (liker_id=$1 AND liked_id=$2) OR (liker_id=$2 AND liked_id=$1)', [first, second])).rows[0].count === 2;
}
export async function like(actor, target, remove = false) {
  if (!uuid(target)) fail();
  if (actor === target) fail('CANNOT_LIKE_SELF', 400);
  const result = await transaction(async client => {
    await lockPair(client, actor, target); await targetExists(client, target);
    if (await blocked(actor, target, client)) fail('USER_BLOCKED', 403);
    const previous = (await client.query('SELECT liker_id,created_at FROM likes WHERE (liker_id=$1 AND liked_id=$2) OR (liker_id=$2 AND liked_id=$1)', [actor, target])).rows;
    const mine = previous.some(row => row.liker_id === actor), theirs = previous.some(row => row.liker_id === target);
    const notices = [];
    if (remove) {
      if (!mine) fail('LIKE_NOT_FOUND', 404);
      await client.query('DELETE FROM likes WHERE liker_id=$1 AND liked_id=$2', [actor, target]);
      if (theirs) notices.push(await createNotification(client, target, actor, 'UNLIKE'));
    } else {
      const me = await profile(actor, actor, client), other = await profile(target, target, client);
      if (!me.pictures.some(picture => picture.isMain)) fail('PROFILE_PICTURE_REQUIRED');
      if (!('profileComplete' in me) || !me.profileComplete || !('profileComplete' in other) || !other.profileComplete) fail('PROFILE_INCOMPLETE');
      if (mine) fail('ALREADY_LIKED', 409);
      await client.query('INSERT INTO likes(liker_id,liked_id) VALUES($1,$2)', [actor, target]);
      notices.push(await createNotification(client, target, actor, 'LIKE'));
      if (theirs) { notices.push(await createNotification(client, target, actor, 'CONNECTION')); notices.push(await createNotification(client, actor, target, 'CONNECTION')); }
    }
    await client.query('UPDATE profiles SET fame_rating=LEAST(100,(SELECT count(*) FROM likes WHERE liked_id=$1)) WHERE user_id=$1', [target]);
    return { notices, theirs, connectedAt: new Date().toISOString() };
  });
  result.notices.forEach(publish);
  if (result.theirs) {
    if (remove) { deliver(actor, 'connection:removed', { userId: target }); deliver(target, 'connection:removed', { userId: actor }); }
    else { deliver(actor, 'connection:new', { user: await profile(target, actor), connectedAt: result.connectedAt }); deliver(target, 'connection:new', { user: await profile(actor, target), connectedAt: result.connectedAt }); }
  }
  return { likedByMe: !remove, hasLikedMe: result.theirs, isConnected: !remove && result.theirs };
}
export async function block(actor, target, remove = false) {
  if (!uuid(target) || actor === target) fail();
  const result = await transaction(async client => {
    await lockPair(client, actor, target); await targetExists(client, target);
    if (remove) { await client.query('DELETE FROM blocks WHERE blocker_id=$1 AND blocked_id=$2', [actor, target]); return null; }
    const existed = (await client.query('SELECT * FROM blocks WHERE blocker_id=$1 AND blocked_id=$2', [actor, target])).rows[0];
    const connected = await mutual(actor, target, client);
    const row = existed || (await client.query('INSERT INTO blocks(blocker_id,blocked_id) VALUES($1,$2) RETURNING *', [actor, target])).rows[0];
    await client.query('DELETE FROM likes WHERE (liker_id=$1 AND liked_id=$2) OR (liker_id=$2 AND liked_id=$1)', [actor, target]);
    await client.query('UPDATE profiles p SET fame_rating=LEAST(100,(SELECT count(*) FROM likes WHERE liked_id=p.user_id)) WHERE user_id=ANY($1::uuid[])', [[actor, target]]);
    return { existed: Boolean(existed), connected, value: { id: row.id, blockedUserId: target, createdAt: iso(row.created_at) } };
  });
  if (result?.connected) { deliver(actor, 'connection:removed', { userId: target }); deliver(target, 'connection:removed', { userId: actor }); }
  return result;
}
export async function visit(actor, target) {
  if (!uuid(target) || actor === target) fail();
  const notice = await transaction(async client => {
    await lockPair(client, actor, target); await targetExists(client, target);
    if (await blocked(actor, target, client)) fail('PROFILE_NOT_FOUND', 404);
    await client.query('INSERT INTO visits(visitor_id,visited_id) VALUES($1,$2)', [actor, target]);
    return createNotification(client, target, actor, 'PROFILE_VIEW');
  });
  publish(notice); return { message: 'Visit recorded.' };
}
export async function report(actor, target, body) {
  fields(body, ['reason', 'details'], ['reason', 'details']);
  if (!uuid(target) || actor === target || !['spam', 'harassment', 'fake_account', 'other'].includes(body.reason) || !text(body.details, 1, 2000)) fail();
  await targetExists(pool, target);
  const row = (await pool.query('INSERT INTO reports(reporter_id,reported_id,reason,details) VALUES($1,$2,$3,$4) ON CONFLICT(reporter_id,reported_id) DO UPDATE SET reason=EXCLUDED.reason,details=EXCLUDED.details RETURNING *', [actor, target, body.reason, body.details.trim()])).rows[0];
  return { id: row.id, reportedUserId: target, reason: row.reason, details: row.details, createdAt: iso(row.created_at) };
}
export async function relationships(actor, kind, query) {
  const page = pagination(query);
  const sources = {
    likes: 'SELECT id,liker_id AS other,created_at AS instant FROM likes WHERE liked_id=$1',
    views: 'SELECT id,visitor_id AS other,created_at AS instant FROM visits WHERE visited_id=$1',
    connections: 'SELECT l1.liked_id AS id,l1.liked_id AS other,GREATEST(l1.created_at,l2.created_at) AS instant FROM likes l1 JOIN likes l2 ON l2.liker_id=l1.liked_id AND l2.liked_id=l1.liker_id WHERE l1.liker_id=$1',
  };
  const source = `(${sources[kind]}) r JOIN users u ON u.id=r.other WHERE u.is_verified AND NOT EXISTS(SELECT 1 FROM blocks b WHERE (b.blocker_id=$1 AND b.blocked_id=r.other) OR (b.blocker_id=r.other AND b.blocked_id=$1))`;
  const total = (await pool.query(`SELECT count(*)::int AS total FROM ${source}`, [actor])).rows[0].total;
  const rows = (await pool.query(`SELECT r.* FROM ${source} ORDER BY r.instant DESC,r.id DESC LIMIT $2 OFFSET $3`, [actor, page.limit, (page.page - 1) * page.limit])).rows;
  const items = await Promise.all(rows.map(async row => {
    const user = await profile(row.other, actor);
    return kind === 'connections' ? { user, connectedAt: iso(row.instant) } : kind === 'likes' ? { id: row.id, actor: user, createdAt: iso(row.instant) } : { id: row.id, viewer: user, viewedAt: iso(row.instant) };
  }));
  return paged(items, total, page);
}