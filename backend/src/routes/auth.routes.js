import { Router } from 'express';
import { register, verify, login, logout, forgotPassword, resetPassword, getMe } from '../controllers/auth.controller.js';
import { requireAuth } from '../middleware/auth.middleware.js';

const router = Router();

router.post('/register', register);
router.get('/verify', verify);
router.post('/login', login);
router.post('/logout', logout);
router.post('/forgot-password', forgotPassword);
router.post('/reset-password', resetPassword);

// Protected routes
router.get('/me', requireAuth, getMe);

export default router;
