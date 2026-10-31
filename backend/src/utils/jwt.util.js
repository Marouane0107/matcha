import jwt from 'jsonwebtoken';
import dotenv from 'dotenv';
dotenv.config();

const getSecret = () => {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error("JWT_SECRET is not defined in environment variables");
  return secret;
};

const DEFAULT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '7d';

export const generateToken = (payload, expiresIn = DEFAULT_EXPIRES_IN) => {
  return jwt.sign(payload, getSecret(), { expiresIn });
};

export const verifyToken = (token) => {
  return jwt.verify(token, getSecret());
};

/**
 * Returns the token expiry duration as seconds (number).
 * Parses the JWT_EXPIRES_IN env var (e.g. "7d", "24h", "3600").
 */
export const getExpiresInSeconds = () => {
  const raw = DEFAULT_EXPIRES_IN;
  const match = raw.match(/^(\d+)([smhd]?)$/);
  if (!match) return 604800; // fallback: 7 days

  const value = parseInt(match[1], 10);
  const unit = match[2] || 's';

  switch (unit) {
    case 's': return value;
    case 'm': return value * 60;
    case 'h': return value * 3600;
    case 'd': return value * 86400;
    default: return value;
  }
};
