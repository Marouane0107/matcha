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

// Profile endpoints — mounted at /api/profile
router.get('/me', requireAuth, getMyProfile);
router.patch('/me', requireAuth, updateMyProfile);

// Picture endpoints — match shared contract paths
router.post('/pictures', requireAuth, uploadPhotoMiddleware, uploadPhoto);
router.delete('/pictures/:id', requireAuth, deletePhoto);
router.patch('/pictures/:id/main', requireAuth, setProfilePicture);

export default router;

// Dedicated router for mounting directly at /api/tags
export const tagRouter = Router();
tagRouter.get('/', requireAuth, getAllTags);
