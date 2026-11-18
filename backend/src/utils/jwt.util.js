import jwt from 'jsonwebtoken';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../../../.env') });

export const validateJwtSecret = () => {
  const secret = process.env.JWT_SECRET;
  if (!secret || Buffer.byteLength(secret, 'utf8') < 32) throw new Error('JWT_SECRET must contain at least 32 bytes');
  return secret;
};

const DEFAULT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '8h';

export const generateToken = (payload, expiresIn = DEFAULT_EXPIRES_IN) => {
  return jwt.sign({ sub: payload.id, ver: payload.version }, validateJwtSecret(), { expiresIn: getExpiresInSeconds(expiresIn), algorithm: 'HS256', issuer: 'matcha-api', audience: 'matcha-web' });
};

export const verifyToken = (token) => {
  const decoded = jwt.verify(token, validateJwtSecret(), { algorithms: ['HS256'], issuer: 'matcha-api', audience: 'matcha-web' });
  if (typeof decoded === 'string') throw new Error('Invalid JWT claims');
  return { ...decoded, id: decoded.sub, version: decoded.ver };
};

/**
 * Returns the token expiry duration as seconds (number).
 * Parses the JWT_EXPIRES_IN env var (e.g. "15m", "8h", "7d", "3600").
 * Clamped to a sane range of 1 second .. 30 days.
 */
export const getExpiresInSeconds = (raw = DEFAULT_EXPIRES_IN) => {
  const match = raw.match(/^(\d+)([smhd]?)$/);
  if (!match) return 8 * 3600;

  const value = parseInt(match[1], 10);
  const unit = match[2] || 's';

  let seconds;
  switch (unit) {
    case 's': seconds = value; break;
    case 'm': seconds = value * 60; break;
    case 'h': seconds = value * 3600; break;
    case 'd': seconds = value * 86400; break;
    default: return 8 * 3600;
  }
  return Math.max(1, Math.min(seconds, 30 * 86400));
};
