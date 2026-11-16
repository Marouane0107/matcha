import { pool } from '../config/db.js';
import { isOnline } from './presence.js';
import { fail, uuid, fields, text } from '../utils/http.util.js';

export const iso = value => value ? new Date(value).toISOString() : null;
export function adult(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const birth = new Date(`${value}T00:00:00Z`);
  if (!Number.isFinite(+birth) || birth.toISOString().slice(0, 10) !== value) return false;
  const today = new Date();
  const age = today.getUTCFullYear() - birth.getUTCFullYear() - (today.toISOString().slice(5, 10) < value.slice(5) ? 1 : 0);
  return age >= 18 && age <= 120;
}
export async function transaction(action) {
  const client = await pool.connect();
  try { await client.query('BEGIN'); const result = await action(client); await client.query('COMMIT'); return result; }
  catch (error) { await client.query('ROLLBACK'); throw error; }
  finally { client.release(); }
}
export async function lockPair(client, first, second) {
  if (!uuid(first) || !uuid(second)) fail();
  await client.query('SELECT id FROM users WHERE id=ANY($1::uuid[]) ORDER BY id FOR UPDATE', [[first, second]]);
}
export async function blocked(first, second, client = pool) {
  return Boolean((await client.query('SELECT 1 FROM blocks WHERE (blocker_id=$1 AND blocked_id=$2) OR (blocker_id=$2 AND blocked_id=$1)', [first, second])).rowCount);
}
export async function profile(id, viewer = id, client = pool) {
  const row = (await client.query(`SELECT u.id,u.username,u.email,u.is_verified,u.last_seen,p.*,
    to_char(p.birth_date,'YYYY-MM-DD') AS birthday,
    (SELECT count(*)::int FROM likes WHERE liked_id=u.id) AS likes
    FROM users u JOIN profiles p ON p.user_id=u.id WHERE u.id=$1`, [id])).rows[0];
  if (!row || viewer !== id && (!row.is_verified || await blocked(id, viewer, client))) fail('PROFILE_NOT_FOUND', 404);
  const tags = (await client.query('SELECT t.id,t.name FROM tags t JOIN user_tags ut ON t.id=ut.tag_id WHERE ut.user_id=$1 ORDER BY t.name,t.id', [id])).rows;
  const pictures = (await client.query('SELECT id,is_profile_picture FROM photos WHERE user_id=$1 ORDER BY position NULLS LAST,created_at,id', [id])).rows.map((picture, index) => ({ id: picture.id, url: `/api/profile/pictures/${picture.id}`, isMain: picture.is_profile_picture, position: index + 1 }));
  const online = isOnline(id);
  const location = row.latitude === null || row.longitude === null ? null : { city: row.city || row.location_string || '', neighborhood: row.neighborhood ?? null };
  const identity = { id, username: row.username, firstName: row.first_name ?? '', lastName: row.last_name ?? '', gender: row.gender, sexualPreference: row.sexual_preference ?? 'everyone', bio: row.biography ?? '', fameRating: Math.min(100, row.likes), tags, pictures, isOnline: online, lastSeen: online ? null : iso(row.last_seen) };
  if (viewer !== id) {
    const likes = (await client.query('SELECT liker_id FROM likes WHERE (liker_id=$1 AND liked_id=$2) OR (liker_id=$2 AND liked_id=$1)', [viewer, id])).rows;
    const likedByMe = likes.some(like => like.liker_id === viewer), hasLikedMe = likes.some(like => like.liker_id === id);
    return { ...identity, age: adult(row.birthday) ? new Date().getUTCFullYear() - Number(row.birthday.slice(0, 4)) - (new Date().toISOString().slice(5, 10) < row.birthday.slice(5) ? 1 : 0) : null, location, likedByMe, hasLikedMe, isConnected: likedByMe && hasLikedMe };
  }
  return { ...identity, email: row.email, dateOfBirth: row.birthday, location: location ? { ...location, latitude: row.latitude, longitude: row.longitude, mode: row.location_mode ?? 'manual' } : null,
    profileComplete: Boolean(row.is_verified && row.first_name?.trim() && row.last_name?.trim() && adult(row.birthday) && row.gender && row.biography?.trim() && tags.length && pictures.some(picture => picture.isMain) && location) };
}
export async function publicByUsername(username, viewer) {
  const row = (await pool.query('SELECT id FROM users WHERE username=$1', [username])).rows[0];
  if (!row) fail('PROFILE_NOT_FOUND', 404);
  if (row.id === viewer) {
    const owner = await profile(row.id);
    if (!('email' in owner)) fail('INTERNAL_ERROR', 500);
    const { email, dateOfBirth, profileComplete, location, ...identity } = owner;
    return { ...identity, age: adult(dateOfBirth) ? new Date().getUTCFullYear() - Number(dateOfBirth.slice(0, 4)) - (new Date().toISOString().slice(5, 10) < dateOfBirth.slice(5) ? 1 : 0) : null, location: location ? { city: location.city, neighborhood: location.neighborhood } : null, likedByMe: false, hasLikedMe: false, isConnected: false };
  }
  return profile(row.id, viewer);
}
export async function update(id, body) {
  fields(body, ['firstName', 'lastName', 'dateOfBirth', 'gender', 'sexualPreference', 'bio', 'tagIds']);
  if (!Object.keys(body).length) fail();
  for (const key of ['firstName', 'lastName']) if (key in body && !text(body[key], 1, 50)) fail();
  if ('dateOfBirth' in body && !adult(body.dateOfBirth) || 'gender' in body && !['man', 'woman', 'non_binary'].includes(body.gender) || 'sexualPreference' in body && !['men', 'women', 'everyone'].includes(body.sexualPreference) || 'bio' in body && !text(body.bio, 0, 1000)) fail();
  if ('tagIds' in body && (!Array.isArray(body.tagIds) || body.tagIds.length > 10 || new Set(body.tagIds).size !== body.tagIds.length || !body.tagIds.every(uuid))) fail();
  await transaction(async client => {
    await client.query('SELECT id FROM users WHERE id=$1 FOR UPDATE', [id]);
    const columns = { firstName: 'first_name', lastName: 'last_name', dateOfBirth: 'birth_date', gender: 'gender', sexualPreference: 'sexual_preference', bio: 'biography' };
    const entries = Object.entries(body).filter(([key]) => key in columns);
    if (entries.length) await client.query(`UPDATE profiles SET ${entries.map(([key], index) => `${columns[key]}=$${index + 2}`).join(',')},updated_at=NOW() WHERE user_id=$1`, [id, ...entries.map(([, value]) => typeof value === 'string' ? value.trim() : value)]);
    if ('tagIds' in body) {
      if ((await client.query('SELECT id FROM tags WHERE id=ANY($1::uuid[])', [body.tagIds])).rowCount !== body.tagIds.length) fail();
      await client.query('DELETE FROM user_tags WHERE user_id=$1', [id]);
      for (const tag of body.tagIds) await client.query('INSERT INTO user_tags(user_id,tag_id) VALUES($1,$2)', [id, tag]);
    }
  });
  return profile(id);
}