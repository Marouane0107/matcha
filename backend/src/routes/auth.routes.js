import { Router } from 'express';
import {
  register,
  verifyEmail,
  login,
  logout,
  forgotPassword,
  resetPassword,
  resendVerification,
  getMe
} from '../controllers/auth.controller.js';
import { requireAuth } from '../middleware/auth.middleware.js';
import { authRateLimit } from '../middleware/rate-limit.middleware.js';

const router = Router();

router.post('/register', authRateLimit, register);
router.post('/verify-email', authRateLimit, verifyEmail);
router.post('/login', authRateLimit, login);
router.post('/logout', logout);
router.post('/forgot-password', authRateLimit, forgotPassword);
router.post('/reset-password', authRateLimit, resetPassword);
router.post('/resend-verification', authRateLimit, resendVerification);

// Protected routes
router.get('/me', requireAuth, getMe);

export default router;
