import { verifyToken } from '../utils/jwt.util.js';
import { apiError, ERROR_CODES } from '../config/shared.js';

export const requireAuth = (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json(apiError(ERROR_CODES.UNAUTHORIZED, 'Authentication required'));
    }

    const token = authHeader.split(' ')[1];
    if (!token) {
      return res.status(401).json(apiError(ERROR_CODES.UNAUTHORIZED, 'Authentication token is missing'));
    }

    const decoded = verifyToken(token);
    req.user = { id: decoded.id };
    
    next();
  } catch (error) {
    return res.status(401).json(apiError(ERROR_CODES.UNAUTHORIZED, 'Invalid or expired token'));
  }
};
