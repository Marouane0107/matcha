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

const router = Router();

router.post('/register', register);
router.post('/verify-email', verifyEmail);
router.post('/login', login);
router.post('/logout', logout);
router.post('/forgot-password', forgotPassword);
router.post('/reset-password', resetPassword);
router.post('/resend-verification', resendVerification);

// Protected routes
router.get('/me', requireAuth, getMe);

export default router;
