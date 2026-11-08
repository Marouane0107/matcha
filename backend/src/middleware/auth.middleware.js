import { verifyToken } from '../utils/jwt.util.js';
import { apiError, ERROR_CODES } from '../config/shared.js';
import { pool } from '../config/db.js';

export const requireAuth = async (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json(apiError(ERROR_CODES.UNAUTHORIZED, 'Authentication required'));
  }

  const token = authHeader.split(' ')[1];
  if (!token) {
    return res.status(401).json(apiError(ERROR_CODES.UNAUTHORIZED, 'Authentication token is missing'));
  }

  let decoded;
  try {
    decoded = verifyToken(token);
  } catch {
    return res.status(401).json(apiError(ERROR_CODES.UNAUTHORIZED, 'Invalid or expired token'));
  }

  try {
    const userResult = await pool.query('SELECT is_verified FROM users WHERE id = $1::uuid', [decoded.id]);
    if (userResult.rows.length === 0) {
      return res.status(401).json(apiError(ERROR_CODES.UNAUTHORIZED, 'Invalid or expired token'));
    }
    if (!userResult.rows[0].is_verified) {
      return res.status(403).json(apiError(ERROR_CODES.EMAIL_NOT_VERIFIED, 'Please verify your email before continuing'));
    }
  } catch (error) {
    return next(error);
  }

  req.user = { id: decoded.id };

  // Best-effort last_seen refresh, throttled to once per minute.
  pool.query(
    `UPDATE users SET last_seen = NOW()
     WHERE id = $1 AND (last_seen IS NULL OR last_seen < NOW() - INTERVAL '1 minute')`,
    [decoded.id]
  ).catch(() => {});

  next();
};
