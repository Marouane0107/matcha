import { pool } from '../config/db.js';
import { apiSuccess, apiError, ERROR_CODES } from '../config/shared.js';

const VALID_REPORT_REASONS = ['spam', 'harassment', 'fake_account', 'other'];

// A user is considered online if active within the last 5 minutes.
const ONLINE_WINDOW = "INTERVAL '5 minutes'";
// Duplicate profile views within this window are ignored.
const VISIT_DEDUP_WINDOW = "INTERVAL '60 seconds'";

/**
 * GET /api/profiles/:id
 * Public profile for another user + relationship flags, recording a visit.
 * Strictly excludes email/password_hash. Rejects if the target blocked the viewer.
 */
export const getPublicProfile = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const targetId = req.params.id;

    const result = await pool.query(
      `
      SELECT
        u.id            AS user_id,
        u.username,
        u.last_seen,
        (u.last_seen IS NOT NULL AND u.last_seen > NOW() - ${ONLINE_WINDOW}) AS is_online,
        p.first_name,
        p.last_name,
        p.gender,
        p.sexual_preference,
        p.biography,
        p.fame_rating,
        p.location_string,
        COALESCE(
          (SELECT json_agg(json_build_object('id', ph.id, 'url', ph.url, 'isMain', ph.is_profile_picture)
             ORDER BY ph.created_at)
           FROM photos ph WHERE ph.user_id = u.id),
          '[]'::json
        ) AS photos,
        COALESCE(
          (SELECT json_agg(json_build_object('id', t.id, 'name', t.name) ORDER BY t.name)
           FROM tags t JOIN user_tags ut ON t.id = ut.tag_id WHERE ut.user_id = u.id),
          '[]'::json
        ) AS tags,
        EXISTS (SELECT 1 FROM likes l WHERE l.liker_id = $1::uuid AND l.liked_id = u.id) AS liked_by_me,
        EXISTS (SELECT 1 FROM likes l WHERE l.liker_id = u.id AND l.liked_id = $1::uuid) AS has_liked_me,
        EXISTS (SELECT 1 FROM blocks b WHERE b.blocker_id = $1::uuid AND b.blocked_id = u.id) AS blocked_by_me,
        EXISTS (SELECT 1 FROM blocks b WHERE b.blocker_id = u.id AND b.blocked_id = $1::uuid) AS blocked_me
      FROM users u
      JOIN profiles p ON u.id = p.user_id
      WHERE u.id = $2::uuid
      `,
      [userId, targetId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json(apiError(ERROR_CODES.PROFILE_NOT_FOUND, 'Profile not found'));
    }

    const row = result.rows[0];

    if (row.blocked_me) {
      return res.status(403).json(apiError(ERROR_CODES.USER_BLOCKED, 'You cannot view this profile'));
    }

    const likedByMe = row.liked_by_me;
    const hasLikedMe = row.has_liked_me;
    const isConnected = likedByMe && hasLikedMe;
    const isBlocked = row.blocked_by_me;
    const canChat = isConnected && !isBlocked;

    // Record the visit — skip self-views and rapid duplicate views.
    await pool.query(
      `
      INSERT INTO visits (visitor_id, visited_id)
      SELECT $1::uuid, $2::uuid
      WHERE $1::uuid <> $2::uuid
        AND NOT EXISTS (
          SELECT 1 FROM visits
          WHERE visitor_id = $1::uuid AND visited_id = $2::uuid
            AND created_at > NOW() - ${VISIT_DEDUP_WINDOW}
        )
      `,
      [userId, targetId]
    );

    res.status(200).json(apiSuccess({
      profile: {
        userId: row.user_id,
        username: row.username,
        firstName: row.first_name,
        lastName: row.last_name,
        gender: row.gender,
        sexualPreference: row.sexual_preference,
        biography: row.biography,
        fameRating: row.fame_rating,
        location: row.location_string,
        isOnline: row.is_online,
        lastSeen: row.last_seen,
        tags: row.tags,
        photos: row.photos,
      },
      relationship: { likedByMe, hasLikedMe, isConnected, isBlocked, canChat },
    }));
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/profiles/:id/like
 * Requires the actor to have a profile picture. Inserts a like; a reciprocal
 * like establishes a connection and emits a CONNECTION notification.
 */
export const likeProfile = async (req, res, next) => {
  const client = await pool.connect();
  try {
    const userId = req.user.id;
    const targetId = req.params.id;

    if (userId === targetId) {
      return res.status(400).json(apiError(ERROR_CODES.CANNOT_LIKE_SELF, 'You cannot like yourself'));
    }

    const target = await client.query('SELECT id FROM users WHERE id = $1::uuid', [targetId]);
    if (target.rows.length === 0) {
      return res.status(404).json(apiError(ERROR_CODES.PROFILE_NOT_FOUND, 'Profile not found'));
    }

    const blocked = await client.query(
      `SELECT 1 FROM blocks
       WHERE (blocker_id = $1::uuid AND blocked_id = $2::uuid) OR (blocker_id = $2::uuid AND blocked_id = $1::uuid)
       LIMIT 1`,
      [userId, targetId]
    );
    if (blocked.rows.length > 0) {
      return res.status(403).json(apiError(ERROR_CODES.USER_BLOCKED, 'You cannot like this user'));
    }

    const picture = await client.query(
      'SELECT 1 FROM photos WHERE user_id = $1::uuid AND is_profile_picture = true LIMIT 1',
      [userId]
    );
    if (picture.rows.length === 0) {
      return res.status(422).json(apiError(ERROR_CODES.PROFILE_PICTURE_REQUIRED, 'Set a profile picture before liking'));
    }

    const existing = await client.query(
      'SELECT 1 FROM likes WHERE liker_id = $1::uuid AND liked_id = $2::uuid LIMIT 1',
      [userId, targetId]
    );
    if (existing.rows.length > 0) {
      return res.status(409).json(apiError(ERROR_CODES.ALREADY_LIKED, 'You already liked this user'));
    }

    const reciprocal = await client.query(
      'SELECT 1 FROM likes WHERE liker_id = $1::uuid AND liked_id = $2::uuid LIMIT 1',
      [targetId, userId]
    );
    const isMatch = reciprocal.rows.length > 0;

    await client.query('BEGIN');
    await client.query(
      'INSERT INTO likes (liker_id, liked_id) VALUES ($1::uuid, $2::uuid)',
      [userId, targetId]
    );
    await client.query(
      `INSERT INTO notifications (user_id, sender_id, type, content)
       VALUES ($1::uuid, $2::uuid, $3, $4)`,
      [targetId, userId, isMatch ? 'CONNECTION' : 'LIKE', isMatch ? 'You have a new match!' : 'Someone liked your profile']
    );
    await client.query('COMMIT');

    res.status(201).json(apiSuccess({
      likedByMe: true,
      hasLikedMe: isMatch,
      isConnected: isMatch,
      isMatch,
    }));
  } catch (error) {
    await client.query('ROLLBACK');
    next(error);
  } finally {
    client.release();
  }
};

/**
 * DELETE /api/profiles/:id/like
 * Removes a like. If a mutual connection existed, emits an UNLIKE notification.
 */
export const unlikeProfile = async (req, res, next) => {
  const client = await pool.connect();
  try {
    const userId = req.user.id;
    const targetId = req.params.id;

    if (userId === targetId) {
      return res.status(400).json(apiError(ERROR_CODES.CANNOT_LIKE_SELF, 'You cannot unlike yourself'));
    }

    await client.query('BEGIN');

    const reciprocal = await client.query(
      'SELECT 1 FROM likes WHERE liker_id = $1::uuid AND liked_id = $2::uuid LIMIT 1',
      [targetId, userId]
    );
    const wasConnected = reciprocal.rows.length > 0;

    const deleted = await client.query(
      'DELETE FROM likes WHERE liker_id = $1::uuid AND liked_id = $2::uuid RETURNING id',
      [userId, targetId]
    );

    if (deleted.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json(apiError(ERROR_CODES.LIKE_NOT_FOUND, 'You have not liked this user'));
    }

    if (wasConnected) {
      await client.query(
        `INSERT INTO notifications (user_id, sender_id, type, content)
         VALUES ($1::uuid, $2::uuid, 'UNLIKE', 'A connection was removed')`,
        [targetId, userId]
      );
    }

    await client.query('COMMIT');

    res.status(200).json(apiSuccess({ likedByMe: false, hasLikedMe: wasConnected, isConnected: false }));
  } catch (error) {
    await client.query('ROLLBACK');
    next(error);
  } finally {
    client.release();
  }
};

/**
 * POST /api/profiles/:id/block
 */
export const blockProfile = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const targetId = req.params.id;

    if (userId === targetId) {
      return res.status(400).json(apiError(ERROR_CODES.VALIDATION_ERROR, 'You cannot block yourself'));
    }

    const target = await pool.query('SELECT id FROM users WHERE id = $1::uuid', [targetId]);
    if (target.rows.length === 0) {
      return res.status(404).json(apiError(ERROR_CODES.PROFILE_NOT_FOUND, 'Profile not found'));
    }

    await pool.query(
      'INSERT INTO blocks (blocker_id, blocked_id) VALUES ($1::uuid, $2::uuid) ON CONFLICT (blocker_id, blocked_id) DO NOTHING',
      [userId, targetId]
    );

    res.status(201).json(apiSuccess({ blocked: true }));
  } catch (error) {
    next(error);
  }
};

/**
 * DELETE /api/profiles/:id/block
 */
export const unblockProfile = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const targetId = req.params.id;

    await pool.query('DELETE FROM blocks WHERE blocker_id = $1::uuid AND blocked_id = $2::uuid', [userId, targetId]);

    res.status(200).json(apiSuccess({ blocked: false }));
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/profiles/:id/report
 */
export const reportProfile = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const targetId = req.params.id;
    const { reason, details } = req.body || {};

    if (!VALID_REPORT_REASONS.includes(reason)) {
      return res.status(400).json(apiError(ERROR_CODES.VALIDATION_ERROR, `Reason must be one of: ${VALID_REPORT_REASONS.join(', ')}`));
    }
    if (typeof details !== 'string' || details.trim().length === 0) {
      return res.status(400).json(apiError(ERROR_CODES.VALIDATION_ERROR, 'Details are required'));
    }
    if (userId === targetId) {
      return res.status(400).json(apiError(ERROR_CODES.VALIDATION_ERROR, 'You cannot report yourself'));
    }

    const target = await pool.query('SELECT id FROM users WHERE id = $1::uuid', [targetId]);
    if (target.rows.length === 0) {
      return res.status(404).json(apiError(ERROR_CODES.PROFILE_NOT_FOUND, 'Profile not found'));
    }

    await pool.query(
      `INSERT INTO reports (reporter_id, reported_id, reason, details)
       VALUES ($1::uuid, $2::uuid, $3, $4)
       ON CONFLICT (reporter_id, reported_id)
       DO UPDATE SET reason = EXCLUDED.reason, details = EXCLUDED.details`,
      [userId, targetId, reason, details.trim()]
    );

    res.status(201).json(apiSuccess({ reported: true }));
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/interactions/likes-received
 * Users who liked the current user (excluding blocked).
 */
export const getLikedBy = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const result = await pool.query(
      `
      SELECT
        u.id AS user_id,
        u.username,
        p.first_name,
        p.last_name,
        p.fame_rating,
        l.created_at AS liked_at
      FROM likes l
      JOIN users u ON u.id = l.liker_id
      JOIN profiles p ON p.user_id = u.id
      WHERE l.liked_id = $1::uuid
        AND NOT EXISTS (
          SELECT 1 FROM blocks b
          WHERE (b.blocker_id = $1::uuid AND b.blocked_id = l.liker_id)
             OR (b.blocker_id = l.liker_id AND b.blocked_id = $1::uuid)
        )
      ORDER BY l.created_at DESC
      `,
      [userId]
    );
    res.status(200).json(apiSuccess({ likes: result.rows }));
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/interactions/views
 * Users who viewed the current user (most recent view per viewer).
 */
export const getViewers = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const result = await pool.query(
      `
      SELECT DISTINCT ON (v.visitor_id)
        u.id AS user_id,
        u.username,
        p.first_name,
        p.last_name,
        v.created_at AS viewed_at
      FROM visits v
      JOIN users u ON u.id = v.visitor_id
      JOIN profiles p ON p.user_id = u.id
      WHERE v.visited_id = $1::uuid
        AND NOT EXISTS (
          SELECT 1 FROM blocks b
          WHERE (b.blocker_id = $1::uuid AND b.blocked_id = v.visitor_id)
             OR (b.blocker_id = v.visitor_id AND b.blocked_id = $1::uuid)
        )
      ORDER BY v.visitor_id, v.created_at DESC
      `,
      [userId]
    );
    res.status(200).json(apiSuccess({ views: result.rows }));
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/interactions/connections
 * Mutual likes (connections), excluding blocked.
 */
export const getConnections = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const result = await pool.query(
      `
      SELECT
        u.id AS user_id,
        u.username,
        p.first_name,
        p.last_name,
        GREATEST(l1.created_at, l2.created_at) AS connected_at
      FROM likes l1
      JOIN likes l2 ON l2.liker_id = l1.liked_id AND l2.liked_id = l1.liker_id
      JOIN users u ON u.id = l1.liked_id
      JOIN profiles p ON p.user_id = u.id
      WHERE l1.liker_id = $1::uuid
        AND NOT EXISTS (
          SELECT 1 FROM blocks b
          WHERE (b.blocker_id = $1::uuid AND b.blocked_id = l1.liked_id)
             OR (b.blocker_id = l1.liked_id AND b.blocked_id = $1::uuid)
        )
      ORDER BY connected_at DESC
      `,
      [userId]
    );
    res.status(200).json(apiSuccess({ connections: result.rows }));
  } catch (error) {
    next(error);
  }
};
