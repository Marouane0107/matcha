import { createRateLimiter } from '../utils/rate-limit.js';
import { apiError, ERROR_CODES } from '../config/shared.js';

export function createRateLimitMiddleware({ windowMs = 60000, limit = 100, keyFn = (req) => req.ip || 'unknown' }) {
  const limiter = createRateLimiter(windowMs);
  return function rateLimit(req, res, next) {
    if (!limiter(keyFn(req), limit)) {
      return res.status(429).json(apiError(ERROR_CODES.RATE_LIMITED, 'Too many requests. Please try again later.'));
    }
    next();
  };
}

export const authRateLimit = createRateLimitMiddleware({ limit: 5 });
