import jwt from 'jsonwebtoken';
import dotenv from 'dotenv';
dotenv.config();

export const validateJwtSecret = () => {
  const secret = process.env.JWT_SECRET;
  if (!secret || Buffer.byteLength(secret, 'utf8') < 32) throw new Error('JWT_SECRET must contain at least 32 bytes');
  return secret;
};

const DEFAULT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '15m';

export const generateToken = (payload, expiresIn = DEFAULT_EXPIRES_IN) => {
  return jwt.sign({ sub: payload.id, ver: payload.version }, validateJwtSecret(), { expiresIn: Math.min(900, getExpiresInSeconds(expiresIn)), algorithm: 'HS256', issuer: 'matcha-api', audience: 'matcha-web' });
};

export const verifyToken = (token) => {
  const decoded = jwt.verify(token, validateJwtSecret(), { algorithms: ['HS256'], issuer: 'matcha-api', audience: 'matcha-web' });
  if (typeof decoded === 'string') throw new Error('Invalid JWT claims');
  return { ...decoded, id: decoded.sub, version: decoded.ver };
};

/**
 * Returns the token expiry duration as seconds (number).
 * Parses the JWT_EXPIRES_IN env var (e.g. "7d", "24h", "3600").
 */
export const getExpiresInSeconds = (raw = DEFAULT_EXPIRES_IN) => {
  const match = raw.match(/^(\d+)([smhd]?)$/);
  if (!match) return 900;

  const value = parseInt(match[1], 10);
  const unit = match[2] || 's';

  switch (unit) {
    case 's': return Math.max(1, Math.min(900, value));
    case 'm': return Math.max(1, Math.min(900, value * 60));
    case 'h': return Math.max(1, Math.min(900, value * 3600));
    case 'd': return Math.max(1, Math.min(900, value * 86400));
    default: return 900;
  }
};
