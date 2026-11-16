import { authenticate } from '../services/session.js';
import { authenticatedRateLimit } from './rate-limit.middleware.js';

export const requireAuth = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw Object.assign(new Error('UNAUTHORIZED'), { statusCode: 401, errorCode: 'UNAUTHORIZED' });
    }

    const token = authHeader.split(' ')[1];
    if (!token) {
      throw Object.assign(new Error('UNAUTHORIZED'), { statusCode: 401, errorCode: 'UNAUTHORIZED' });
    }

    req.user = await authenticate(token);
    authenticatedRateLimit(req, res, next);
  } catch (error) {
    next(error);
  }
};
