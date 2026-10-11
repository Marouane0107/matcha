import { Router } from 'express';
import { requireAuth } from '../middleware/auth.middleware.js';
import { uploadPhotoMiddleware } from '../middleware/upload.middleware.js';
import {
  getMyProfile,
  updateMyProfile,
  getAllTags,
  uploadPhoto,
  deletePhoto,
  setProfilePicture
} from '../controllers/profile.controller.js';

const router = Router();

// Profile endpoints
router.get('/me', requireAuth, getMyProfile);
router.patch('/me', requireAuth, updateMyProfile);

// Photo endpoints
router.post('/me/photos', requireAuth, uploadPhotoMiddleware, uploadPhoto);
router.delete('/me/photos/:id', requireAuth, deletePhoto);
router.patch('/me/photos/:id/profile-picture', requireAuth, setProfilePicture);

// Also expose /api/profiles/tags if accessed via profiles router
router.get('/tags', requireAuth, getAllTags);

export default router;

// Dedicated router for mounting directly at /api/tags
export const tagRouter = Router();
tagRouter.get('/', requireAuth, getAllTags);
