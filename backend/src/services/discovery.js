import { pool } from '../config/db.js';
import { fail, uuid, paged, pagination } from '../utils/http.util.js';
import { profile } from './profile.js';

export async function discover(actor, query, suggestions = false) {
  const allowed = ['minAge', 'maxAge', 'minFame', 'maxFame', 'maxDistance', 'location', 'tags', 'sortBy', 'sortOrder', 'page', 'limit'];
  if (Object.keys(query).some(key => !allowed.includes(key)) || Object.values(query).some(value => typeof value !== 'string' || !value.trim())) fail();
  const page = pagination(Object.fromEntries(Object.entries(query).filter(([key]) => ['page', 'limit'].includes(key))));
  const number = (key, fallback, min, max, integer = false) => {
    if (query[key] !== undefined && !/^\d+(?:\.\d+)?$/.test(query[key])) fail();
    const value = query[key] === undefined ? fallback : Number(query[key]);
    if (!Number.isFinite(value) || value < min || value > max || integer && !Number.isInteger(value)) fail();
    return value;
  };
  const minAge = number('minAge', 18, 18, 120, true), maxAge = number('maxAge', 120, 18, 120, true);
  const minFame = number('minFame', 0, 0, 100), maxFame = number('maxFame', 100, 0, 100);
  const radius = number('maxDistance', 20000, Number.MIN_VALUE, 20000);
  if (minAge > maxAge || minFame > maxFame) fail();
  const me = await profile(actor);
  if (!('profileComplete' in me)) fail('INTERNAL_ERROR', 500);
  let origin = me.location ? [me.location.latitude, me.location.longitude] : null;
  if (query.location !== undefined) {
    if (!/^-?\d+(?:\.\d+)?,-?\d+(?:\.\d+)?$/.test(query.location)) fail();
    origin = query.location.split(',').map(Number);
    if (Math.abs(origin[0]) > 90 || Math.abs(origin[1]) > 180) fail();
  }
  if (!origin) fail('LOCATION_REQUIRED');
  if (!me.profileComplete) fail('PROFILE_INCOMPLETE');
  const tags = query.tags?.split(',') ?? [];
  if (tags.length > 10 || tags.some(tag => !uuid(tag)) || new Set(tags).size !== tags.length) fail();
  if (tags.length && (await pool.query('SELECT id FROM tags WHERE id=ANY($1::uuid[])', [tags])).rowCount !== tags.length) fail();
  const sorts = { age: 'age', distance: 'distance', fame: 'fame', commonTags: 'common' };
  if (query.sortBy !== undefined && !Object.hasOwn(sorts, query.sortBy) || query.sortOrder !== undefined && !['asc', 'desc'].includes(query.sortOrder)) fail();
  const order = suggestions && query.sortBy === undefined ? 'distance ASC,common DESC,fame DESC,id ASC' : `${sorts[query.sortBy ?? 'distance']} ${query.sortOrder === 'desc' ? 'DESC' : 'ASC'},id ASC`;
  const sql = `WITH candidates AS (SELECT u.id,EXTRACT(YEAR FROM AGE(p.birth_date))::int AS age,
    6371*2*asin(sqrt(least(1,greatest(0,power(sin(radians(p.latitude-$2::float8)/2),2)+cos(radians($2::float8))*cos(radians(p.latitude))*power(sin(radians(p.longitude-$3::float8)/2),2))))) AS distance,
    LEAST(100,(SELECT count(*) FROM likes WHERE liked_id=u.id)) AS fame,
    (SELECT count(*) FROM user_tags mine JOIN user_tags theirs ON theirs.tag_id=mine.tag_id WHERE mine.user_id=$1 AND theirs.user_id=u.id) AS common
    FROM users u JOIN profiles p ON p.user_id=u.id WHERE u.id<>$1 AND u.is_verified AND p.latitude IS NOT NULL AND p.longitude IS NOT NULL
    AND p.birth_date IS NOT NULL AND p.gender IS NOT NULL AND length(trim(p.first_name))>0 AND length(trim(p.last_name))>0 AND length(trim(p.biography))>0
    AND EXISTS(SELECT 1 FROM user_tags WHERE user_id=u.id) AND EXISTS(SELECT 1 FROM photos WHERE user_id=u.id AND is_profile_picture)
    AND NOT EXISTS(SELECT 1 FROM blocks WHERE (blocker_id=$1 AND blocked_id=u.id) OR (blocker_id=u.id AND blocked_id=$1))
    AND ($4='everyone' OR ($4='men' AND p.gender='man') OR ($4='women' AND p.gender='woman'))
    AND (p.sexual_preference='everyone' OR (p.sexual_preference='men' AND $5='man') OR (p.sexual_preference='women' AND $5='woman'))
    AND NOT EXISTS(SELECT 1 FROM unnest($6::uuid[]) requested WHERE NOT EXISTS(SELECT 1 FROM user_tags WHERE user_id=u.id AND tag_id=requested)))
    SELECT * FROM candidates WHERE age BETWEEN $7 AND $8 AND fame BETWEEN $9 AND $10 AND distance<=$11`;
  const values = [actor, ...origin, me.sexualPreference, me.gender, tags, minAge, maxAge, minFame, maxFame, radius];
  const total = (await pool.query(`SELECT count(*)::int AS total FROM (${sql}) results`, values)).rows[0].total;
  const rows = (await pool.query(`${sql} ORDER BY ${order} LIMIT $12 OFFSET $13`, [...values, page.limit, (page.page - 1) * page.limit])).rows;
  return paged(await Promise.all(rows.map(async row => ({ ...await profile(row.id, actor), distanceKm: Math.round(row.distance), commonTags: Number(row.common) }))), total, page);
}