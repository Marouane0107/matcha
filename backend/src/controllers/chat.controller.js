import { pool } from '../config/db.js';
import { apiSuccess, apiError, ERROR_CODES } from '../config/shared.js';
import { fetchFullProfile } from './profile.controller.js';
import { userProfileToPublic } from '../utils/profile-serialize.js';
import { isUserOnline } from '../sockets/presence.js';
import { buildChatMessage } from '../utils/chat.util.js';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const getConversations = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const connections = await pool.query(
      `SELECT l.liked_id AS user_id, GREATEST(l.created_at, l2.created_at) AS connected_at
       FROM likes l
       JOIN likes l2 ON l2.liker_id = l.liked_id AND l2.liked_id = l.liker_id
       WHERE l.liker_id = $1::uuid
         AND NOT EXISTS (
           SELECT 1 FROM blocks b
           WHERE (b.blocker_id = $1::uuid AND b.blocked_id = l.liked_id)
              OR (b.blocker_id = l.liked_id AND b.blocked_id = $1::uuid)
         )
       ORDER BY connected_at DESC`,
      [userId]
    );

    const conversations = [];
    for (const conn of connections.rows) {
      const profile = await fetchFullProfile(pool, conn.user_id);
      if (!profile) continue;
      const last = await pool.query(
        `SELECT * FROM messages
         WHERE (sender_id = $1::uuid AND receiver_id = $2::uuid) OR (sender_id = $2::uuid AND receiver_id = $1::uuid)
         ORDER BY created_at DESC
         LIMIT 1`,
        [userId, conn.user_id]
      );
      conversations.push({
        user: userProfileToPublic(profile, { likedByMe: true, hasLikedMe: true, isOnline: isUserOnline(conn.user_id) }),
        lastMessage: last.rows.length ? buildChatMessage(last.rows[0]) : null,
        connectedAt: new Date(conn.connected_at).toISOString(),
      });
    }

    res.status(200).json(apiSuccess({ conversations }));
  } catch (error) {
    next(error);
  }
};

export const getMessages = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const otherId = req.params.userId;
    if (!UUID_RE.test(otherId ?? '')) {
      return res.status(400).json(apiError(ERROR_CODES.VALIDATION_ERROR, 'Invalid user id'));
    }
    const result = await pool.query(
      `SELECT * FROM messages
       WHERE (sender_id = $1::uuid AND receiver_id = $2::uuid) OR (sender_id = $2::uuid AND receiver_id = $1::uuid)
       ORDER BY created_at ASC`,
      [userId, otherId]
    );
    res.status(200).json(apiSuccess({ messages: result.rows.map(buildChatMessage) }));
  } catch (error) {
    next(error);
  }
};
