/**
 * Browse Controller
 *
 * GET /api/profiles/suggestions – Suggested profiles for the current user
 * GET /api/profiles/search      – Advanced multi-criteria search
 *
 * All queries use raw parameterized SQL via pg. Sorting identifiers are
 * validated against a strict allow-list to eliminate SQL-injection risks.
 *
 * Strategy: A CTE named `me` fetches the authenticated user's profile once.
 * All downstream expressions (Haversine, eligibility) reference CTE columns
 * so that only $1 (the user id) needs a param cast — eliminating PostgreSQL's
 * "could not determine data type" error for lat/lon/gender/pref params.
 */

import { pool } from '../config/db.js';
import { apiSuccess, apiError, ERROR_CODES } from '../config/shared.js';

// ── Strict allow-lists for ORDER BY identifiers ────────────────────
const SORT_COLUMNS = {
  distance:   'distance_km',
  age:        'age',
  fame:       'p.fame_rating',
  commonTags: 'common_tag_count',
};

const SORT_DIRECTIONS = new Set(['ASC', 'DESC']);

/**
 * Resolve and validate sort parameters from query string.
 * Always appends a deterministic tie-breaker (p.user_id ASC).
 */
function resolveSortClause(sortKey, dirKey) {
  const col = SORT_COLUMNS[sortKey] || 'distance_km';
  const dir = SORT_DIRECTIONS.has(String(dirKey).toUpperCase())
    ? String(dirKey).toUpperCase()
    : 'ASC';
  return `${col} ${dir}, p.user_id ASC`;
}

// ── Haversine fragment using CTE columns ────────────────────────────
const HAVERSINE = `(
  6371.0 * 2.0 * ASIN(
    SQRT(
      POWER(SIN(RADIANS(p.latitude - me.latitude) / 2.0), 2)
      + COS(RADIANS(me.latitude))
        * COS(RADIANS(p.latitude))
        * POWER(SIN(RADIANS(p.longitude - me.longitude) / 2.0), 2)
    )
  )
)`;

// ── Eligibility filter using CTE columns ────────────────────────────
// Excludes: self, blocked/blocking users, incompatible gender↔preference
const ELIGIBILITY = `
  u.id != me.user_id
  AND NOT EXISTS (
    SELECT 1 FROM blocks b
    WHERE (b.blocker_id = me.user_id AND b.blocked_id = u.id)
       OR (b.blocker_id = u.id       AND b.blocked_id = me.user_id)
  )
  AND (
    me.sexual_preference = 'bisexual'
    OR me.gender = 'other'
    OR (me.sexual_preference = 'heterosexual' AND me.gender = 'male'   AND p.gender = 'female')
    OR (me.sexual_preference = 'heterosexual' AND me.gender = 'female' AND p.gender = 'male')
    OR (me.sexual_preference = 'homosexual'   AND me.gender = 'male'   AND p.gender = 'male')
    OR (me.sexual_preference = 'homosexual'   AND me.gender = 'female' AND p.gender = 'female')
  )
  AND (
    p.sexual_preference = 'bisexual'
    OR p.gender = 'other'
    OR (p.sexual_preference = 'heterosexual' AND p.gender = 'male'   AND me.gender = 'female')
    OR (p.sexual_preference = 'heterosexual' AND p.gender = 'female' AND me.gender = 'male')
    OR (p.sexual_preference = 'homosexual'   AND p.gender = 'male'   AND me.gender = 'male')
    OR (p.sexual_preference = 'homosexual'   AND p.gender = 'female' AND me.gender = 'female')
  )
`;

// ── CTE preamble ────────────────────────────────────────────────────
// $1 is always the authenticated user's UUID
const ME_CTE = `
  me AS (
    SELECT p.user_id, p.latitude, p.longitude, p.gender,
           COALESCE(p.sexual_preference, 'bisexual') AS sexual_preference
    FROM profiles p
    WHERE p.user_id = $1::uuid
  )
`;

// ─────────────────────────────────────────────────────────────────────
// GET /api/profiles/suggestions
// ─────────────────────────────────────────────────────────────────────
export const getSuggestions = async (req, res, next) => {
  try {
    const userId = req.user.id;

    // 1. Quick check that profile exists and has location
    const meCheck = await pool.query(
      `SELECT latitude, longitude FROM profiles WHERE user_id = $1`,
      [userId]
    );
    if (meCheck.rows.length === 0) {
      return res.status(400).json(
        apiError(ERROR_CODES.PROFILE_NOT_FOUND, 'Complete your profile before browsing.')
      );
    }
    if (meCheck.rows[0].latitude == null || meCheck.rows[0].longitude == null) {
      return res.status(400).json(
        apiError(ERROR_CODES.VALIDATION_ERROR, 'Location is required. Update your profile to enable suggestions.')
      );
    }

    // 2. Parse & validate query params
    const page      = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit     = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 20));
    const offset    = (page - 1) * limit;
    const minAge    = parseInt(req.query.minAge, 10) || null;
    const maxAge    = parseInt(req.query.maxAge, 10) || null;
    const maxDist   = parseFloat(req.query.maxDistance) || null;
    const minFame   = parseFloat(req.query.minFame) || null;
    const sortKey   = req.query.sort || 'distance';
    const sortDir   = req.query.order || 'ASC';
    const tagsParam = req.query.tags
      ? String(req.query.tags).split(',').map(t => t.trim().toLowerCase()).filter(Boolean)
      : null;

    const orderBy = resolveSortClause(sortKey, sortDir);

    // 3. Build parameterized query — $1 is always userId
    const values = [userId];
    let paramIdx = 2;

    const extraConditions = [];

    if (minAge != null) {
      extraConditions.push(`EXTRACT(YEAR FROM AGE(p.birth_date)) >= $${paramIdx}::int`);
      values.push(minAge);
      paramIdx++;
    }
    if (maxAge != null) {
      extraConditions.push(`EXTRACT(YEAR FROM AGE(p.birth_date)) <= $${paramIdx}::int`);
      values.push(maxAge);
      paramIdx++;
    }
    if (maxDist != null) {
      extraConditions.push(`${HAVERSINE} <= $${paramIdx}::float8`);
      values.push(maxDist);
      paramIdx++;
    }
    if (minFame != null) {
      extraConditions.push(`p.fame_rating >= $${paramIdx}::float8`);
      values.push(minFame);
      paramIdx++;
    }
    if (tagsParam && tagsParam.length > 0) {
      extraConditions.push(`
        EXISTS (
          SELECT 1 FROM user_tags ut_filter
          JOIN tags t_filter ON ut_filter.tag_id = t_filter.id
          WHERE ut_filter.user_id = u.id
            AND t_filter.name = ANY($${paramIdx}::text[])
        )
      `);
      values.push(tagsParam);
      paramIdx++;
    }

    const extraWhere = extraConditions.length > 0
      ? 'AND ' + extraConditions.join('\n    AND ')
      : '';

    const limitParam  = `$${paramIdx}::int`;  values.push(limit);  paramIdx++;
    const offsetParam = `$${paramIdx}::int`;  values.push(offset); paramIdx++;

    const sql = `
      WITH ${ME_CTE}
      SELECT
        u.id          AS user_id,
        u.username,
        p.first_name,
        p.last_name,
        p.gender,
        p.sexual_preference,
        p.biography,
        p.fame_rating,
        p.latitude,
        p.longitude,
        p.location_string,
        p.birth_date,
        EXTRACT(YEAR FROM AGE(p.birth_date))::int AS age,
        ROUND(${HAVERSINE}::numeric, 2)           AS distance_km,
        (
          SELECT COUNT(*)::int
          FROM user_tags ut1
          JOIN user_tags ut2 ON ut1.tag_id = ut2.tag_id
          WHERE ut1.user_id = u.id AND ut2.user_id = me.user_id
        ) AS common_tag_count,
        (
          SELECT COALESCE(json_agg(json_build_object('id', t.id, 'name', t.name) ORDER BY t.name), '[]'::json)
          FROM tags t
          JOIN user_tags ut ON t.id = ut.tag_id
          WHERE ut.user_id = u.id
        ) AS tags,
        (
          SELECT json_build_object('id', ph.id, 'url', ph.url)
          FROM photos ph
          WHERE ph.user_id = u.id AND ph.is_profile_picture = true
          LIMIT 1
        ) AS profile_picture
      FROM users u
      JOIN profiles p ON u.id = p.user_id
      CROSS JOIN me
      WHERE ${ELIGIBILITY}
        AND p.birth_date IS NOT NULL
        AND p.gender IS NOT NULL
        ${extraWhere}
      ORDER BY ${orderBy}
      LIMIT ${limitParam} OFFSET ${offsetParam}
    `;

    const startMs = Date.now();
    const result  = await pool.query(sql, values);
    const queryMs = Date.now() - startMs;

    // Total count (same filters, no LIMIT/OFFSET)
    const countValues = values.slice(0, -2); // strip limit & offset
    const countSql = `
      WITH ${ME_CTE}
      SELECT COUNT(*)::int AS total
      FROM users u
      JOIN profiles p ON u.id = p.user_id
      CROSS JOIN me
      WHERE ${ELIGIBILITY}
        AND p.birth_date IS NOT NULL
        AND p.gender IS NOT NULL
        ${extraWhere}
    `;
    const countResult = await pool.query(countSql, countValues);
    const total = countResult.rows[0].total;

    res.status(200).json(apiSuccess({
      profiles: result.rows,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
      meta: { queryTimeMs: queryMs },
    }));
  } catch (error) {
    next(error);
  }
};

// ─────────────────────────────────────────────────────────────────────
// GET /api/profiles/search
// ─────────────────────────────────────────────────────────────────────
export const searchProfiles = async (req, res, next) => {
  try {
    const userId = req.user.id;

    // 1. Quick check that profile exists
    const meCheck = await pool.query(
      `SELECT latitude, longitude FROM profiles WHERE user_id = $1`,
      [userId]
    );
    if (meCheck.rows.length === 0) {
      return res.status(400).json(
        apiError(ERROR_CODES.PROFILE_NOT_FOUND, 'Complete your profile before searching.')
      );
    }

    const hasGeo = meCheck.rows[0].latitude != null && meCheck.rows[0].longitude != null;

    // 2. Parse & validate query params
    const page      = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit     = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 20));
    const offset    = (page - 1) * limit;
    const minAge    = parseInt(req.query.minAge, 10) || null;
    const maxAge    = parseInt(req.query.maxAge, 10) || null;
    const minFame   = parseFloat(req.query.minFame) || null;
    const maxFame   = parseFloat(req.query.maxFame) || null;
    const maxDist   = parseFloat(req.query.maxDistance) || null;
    const sortKey   = req.query.sort || 'distance';
    const sortDir   = req.query.order || 'ASC';
    const tagsParam = req.query.tags
      ? String(req.query.tags).split(',').map(t => t.trim().toLowerCase()).filter(Boolean)
      : null;

    const orderBy = resolveSortClause(sortKey, sortDir);

    // 3. Build parameterized query — $1 is always userId
    const values = [userId];
    let paramIdx = 2;

    const extraConditions = [];

    if (minAge != null) {
      extraConditions.push(`EXTRACT(YEAR FROM AGE(p.birth_date)) >= $${paramIdx}::int`);
      values.push(minAge);
      paramIdx++;
    }
    if (maxAge != null) {
      extraConditions.push(`EXTRACT(YEAR FROM AGE(p.birth_date)) <= $${paramIdx}::int`);
      values.push(maxAge);
      paramIdx++;
    }
    if (minFame != null) {
      extraConditions.push(`p.fame_rating >= $${paramIdx}::float8`);
      values.push(minFame);
      paramIdx++;
    }
    if (maxFame != null) {
      extraConditions.push(`p.fame_rating <= $${paramIdx}::float8`);
      values.push(maxFame);
      paramIdx++;
    }
    if (maxDist != null && hasGeo) {
      extraConditions.push(`${HAVERSINE} <= $${paramIdx}::float8`);
      values.push(maxDist);
      paramIdx++;
    }
    if (tagsParam && tagsParam.length > 0) {
      extraConditions.push(`
        EXISTS (
          SELECT 1 FROM user_tags ut_filter
          JOIN tags t_filter ON ut_filter.tag_id = t_filter.id
          WHERE ut_filter.user_id = u.id
            AND t_filter.name = ANY($${paramIdx}::text[])
        )
      `);
      values.push(tagsParam);
      paramIdx++;
    }

    const extraWhere = extraConditions.length > 0
      ? 'AND ' + extraConditions.join('\n    AND ')
      : '';

    const limitParam  = `$${paramIdx}::int`;  values.push(limit);  paramIdx++;
    const offsetParam = `$${paramIdx}::int`;  values.push(offset); paramIdx++;

    const sql = `
      WITH ${ME_CTE}
      SELECT
        u.id          AS user_id,
        u.username,
        p.first_name,
        p.last_name,
        p.gender,
        p.sexual_preference,
        p.biography,
        p.fame_rating,
        p.latitude,
        p.longitude,
        p.location_string,
        p.birth_date,
        EXTRACT(YEAR FROM AGE(p.birth_date))::int AS age,
        ROUND(${HAVERSINE}::numeric, 2)           AS distance_km,
        (
          SELECT COUNT(*)::int
          FROM user_tags ut1
          JOIN user_tags ut2 ON ut1.tag_id = ut2.tag_id
          WHERE ut1.user_id = u.id AND ut2.user_id = me.user_id
        ) AS common_tag_count,
        (
          SELECT COALESCE(json_agg(json_build_object('id', t.id, 'name', t.name) ORDER BY t.name), '[]'::json)
          FROM tags t
          JOIN user_tags ut ON t.id = ut.tag_id
          WHERE ut.user_id = u.id
        ) AS tags,
        (
          SELECT json_build_object('id', ph.id, 'url', ph.url)
          FROM photos ph
          WHERE ph.user_id = u.id AND ph.is_profile_picture = true
          LIMIT 1
        ) AS profile_picture
      FROM users u
      JOIN profiles p ON u.id = p.user_id
      CROSS JOIN me
      WHERE ${ELIGIBILITY}
        AND p.birth_date IS NOT NULL
        AND p.gender IS NOT NULL
        ${extraWhere}
      ORDER BY ${orderBy}
      LIMIT ${limitParam} OFFSET ${offsetParam}
    `;

    const startMs = Date.now();
    const result  = await pool.query(sql, values);
    const queryMs = Date.now() - startMs;

    // Total count
    const countValues = values.slice(0, -2);
    const countSql = `
      WITH ${ME_CTE}
      SELECT COUNT(*)::int AS total
      FROM users u
      JOIN profiles p ON u.id = p.user_id
      CROSS JOIN me
      WHERE ${ELIGIBILITY}
        AND p.birth_date IS NOT NULL
        AND p.gender IS NOT NULL
        ${extraWhere}
    `;
    const countResult = await pool.query(countSql, countValues);
    const total = countResult.rows[0].total;

    res.status(200).json(apiSuccess({
      profiles: result.rows,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
      meta: { queryTimeMs: queryMs },
    }));
  } catch (error) {
    next(error);
  }
};
