import { pool } from '../config/db.js';
import { apiSuccess, apiError, ERROR_CODES } from '../config/shared.js';
import { mapNotificationRow } from '../utils/notification.util.js';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const listNotifications = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 20));
    const offset = (page - 1) * limit;

    const result = await pool.query(
      `SELECT n.id, n.sender_id, n.type, n.is_read, n.created_at, n.metadata, u.username AS actor_username
       FROM notifications n
       LEFT JOIN users u ON u.id = n.sender_id
       WHERE n.user_id = $1::uuid
       ORDER BY n.created_at DESC
       LIMIT $2 OFFSET $3`,
      [userId, limit, offset]
    );
    const total = await pool.query('SELECT COUNT(*)::int AS c FROM notifications WHERE user_id = $1::uuid', [userId]);

    res.status(200).json(apiSuccess({
      notifications: result.rows.map(mapNotificationRow),
      pagination: { page, limit, total: total.rows[0].c, totalPages: Math.ceil(total.rows[0].c / limit) },
    }));
  } catch (error) {
    next(error);
  }
};

export const unreadCount = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const result = await pool.query('SELECT COUNT(*)::int AS c FROM notifications WHERE user_id = $1::uuid AND is_read = FALSE', [userId]);
    res.status(200).json(apiSuccess({ unreadCount: result.rows[0].c }));
  } catch (error) {
    next(error);
  }
};

export const markRead = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { notificationId } = req.params;
    if (!UUID_RE.test(notificationId ?? '')) {
      return res.status(404).json(apiError(ERROR_CODES.NOT_FOUND, 'Notification not found'));
    }
    const updated = await pool.query(
      'UPDATE notifications SET is_read = TRUE WHERE id = $1::uuid AND user_id = $2::uuid RETURNING id',
      [notificationId, userId]
    );
    if (updated.rows.length === 0) {
      return res.status(404).json(apiError(ERROR_CODES.NOT_FOUND, 'Notification not found'));
    }
    const unread = await pool.query('SELECT COUNT(*)::int AS c FROM notifications WHERE user_id = $1::uuid AND is_read = FALSE', [userId]);
    res.status(200).json(apiSuccess({ notificationId, read: true, unreadCount: unread.rows[0].c }));
  } catch (error) {
    next(error);
  }
};

export const markAllRead = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const updated = await pool.query(
      'UPDATE notifications SET is_read = TRUE WHERE user_id = $1::uuid AND is_read = FALSE',
      [userId]
    );
    const unread = await pool.query('SELECT COUNT(*)::int AS c FROM notifications WHERE user_id = $1::uuid AND is_read = FALSE', [userId]);
    res.status(200).json(apiSuccess({ unreadCount: unread.rows[0].c, updatedCount: updated.rowCount }));
  } catch (error) {
    next(error);
  }
};
