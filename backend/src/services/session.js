import { pool } from '../config/db.js';
import { verifyToken } from '../utils/jwt.util.js';
import { fail, uuid } from '../utils/http.util.js';

export const revoked = new Set();
export async function authenticate(token) {
  let decoded;
  try { decoded = verifyToken(token); } catch { fail('UNAUTHORIZED', 401); }
  if (!decoded || typeof decoded === 'string' || !uuid(decoded.id) || !Number.isInteger(decoded.version)) fail('UNAUTHORIZED', 401);
  const user = (await pool.query('SELECT id, is_verified, token_version FROM users WHERE id=$1', [decoded.id])).rows[0];
  if (!user || user.token_version !== decoded.version) fail('UNAUTHORIZED', 401);
  if (!user.is_verified) fail('EMAIL_NOT_VERIFIED', 403);
  return { id: user.id, version: decoded.version, exp: decoded.exp };
}
export async function invalidate(userId, client = pool) {
  await client.query('UPDATE users SET token_version=token_version+1 WHERE id=$1', [userId]);
}
export function disconnectSessions(userId) { for (const listener of revoked) listener(userId); }