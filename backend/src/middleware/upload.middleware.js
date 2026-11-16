import multer from 'multer';
import path from 'path';
import { apiError } from '../config/shared.js';

// Allowed MIME types and extensions
const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const ALLOWED_EXTENSIONS = /\.(jpe?g|png|webp)$/i;
const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB

// Store files in memory for strict Sharp decoding and processing before saving to disk
const storage = multer.memoryStorage();

const fileFilter = (req, file, cb) => {
  const mimeMatches = ALLOWED_MIME_TYPES.includes(file.mimetype);
  const extMatches = ALLOWED_EXTENSIONS.test(path.extname(file.originalname));

  if (mimeMatches && extMatches) {
    cb(null, true);
  } else {
    /** @type {Error & { statusCode?: number }} */
    const error = new Error('Invalid file type. Only JPEG, PNG, and WebP images are allowed.');
    error.statusCode = 400;
    cb(error, false);
  }
};

const upload = multer({
  storage,
  limits: {
    fileSize: MAX_FILE_SIZE,
    files: 1
  },
  fileFilter
});

// Middleware supporting either 'photo' or 'image' field names
const multerFields = upload.single('picture');

export const uploadPhotoMiddleware = (req, res, next) => {
  multerFields(req, res, (err) => {
    if (err) {
      if (err instanceof multer.MulterError) {
        if (err.code === 'LIMIT_FILE_SIZE') {
          return res.status(422).json(apiError('UPLOAD_TOO_LARGE', 'File exceeds 5MB'));
        }
        return res.status(422).json(apiError('UPLOAD_INVALID_TYPE', 'Invalid upload'));
      }
      return res.status(422).json(apiError('UPLOAD_INVALID_TYPE', 'Invalid image'));
    }

    // Normalize file reference to req.file
    if (req.files) {
      req.file = req.files.photo?.[0] || req.files.image?.[0] || null;
    }

    if (!req.file) {
      return res.status(422).json(apiError('UPLOAD_INVALID_TYPE', 'A picture file is required'));
    }

    next();
  });
};
