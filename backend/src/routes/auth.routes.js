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
import { route, send } from '../utils/http.util.js';
import { changeEmail, verifyEmailChange } from '../services/email-change.js';

const router = Router();

router.post('/register', route(register));
router.post('/verify-email', route(verifyEmail));
router.post('/login', route(login));
router.post('/logout', requireAuth, route(logout));
router.post('/forgot-password', route(forgotPassword));
router.post('/reset-password', route(resetPassword));
router.post('/resend-verification', route(resendVerification));
router.post('/change-email', requireAuth, route(async (req, res) => send(res, await changeEmail(req.user.id, req.body))));
router.post('/verify-email-change', route(async (req, res) => send(res, await verifyEmailChange(req.body))));

// Protected routes
router.get('/me', requireAuth, route(getMe));

export default router;
