import { pool } from '../config/db.js';
import sharp from 'sharp';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { apiSuccess, apiError, ERROR_CODES, DEFAULT_SEXUAL_PREFERENCE } from '../config/shared.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const UPLOADS_DIR = path.resolve(__dirname, '../../uploads');

// Allowed gender values per the shared contract
const VALID_GENDERS = ['man', 'woman', 'non_binary'];
// Allowed sexual preference values per the shared contract
const VALID_SEXUAL_PREFERENCES = ['men', 'women', 'everyone'];

const ONLINE_WINDOW_MS = 5 * 60 * 1000;

function toDateOnly(value) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}`;
}

function toLocation(row) {
  if (row.latitude == null || row.longitude == null) return null;
  return {
    city: typeof row.location_string === "string" ? row.location_string : "",
    neighborhood: null,
    latitude: Number(row.latitude),
    longitude: Number(row.longitude),
    mode: "manual",
  };
}

function toPictures(photos) {
  return photos.map((photo, index) => ({
    id: photo.id,
    url: photo.url,
    isMain: Boolean(photo.is_profile_picture),
    position: index + 1,
  }));
}

/**
 * Helper to compute whether a user's profile is complete:
 * Requires gender, sexual_preference, biography, at least one tag, and at least one photo.
 */
export const calculateProfileComplete = (profile, tags = [], photos = []) => {
  const hasGender = Boolean(profile?.gender && profile.gender.trim().length > 0);
  const hasPreference = Boolean(profile?.sexual_preference && profile.sexual_preference.trim().length > 0);
  const hasBio = Boolean(profile?.biography && profile.biography.trim().length > 0);
  const hasTags = Array.isArray(tags) && tags.length > 0;
  const hasPhotos = Array.isArray(photos) && photos.length > 0;

  return Boolean(hasGender && hasPreference && hasBio && hasTags && hasPhotos);
};

/**
 * Helper to fetch a full profile object with tags, photos, and profileComplete
 */
export const fetchFullProfile = async (clientOrPool, userId) => {
  const profileQuery = `
    SELECT 
      u.id AS user_id,
      u.username,
      u.email,
      u.last_seen,
      p.id AS profile_id,
      p.first_name,
      p.last_name,
      p.birth_date,
      p.gender,
      p.sexual_preference,
      p.biography,
      p.fame_rating,
      p.latitude,
      p.longitude,
      p.location_string,
      p.created_at,
      p.updated_at
    FROM users u
    LEFT JOIN profiles p ON u.id = p.user_id
    WHERE u.id = $1
  `;
  const profileResult = await clientOrPool.query(profileQuery, [userId]);
  if (profileResult.rows.length === 0) {
    return null;
  }

  const row = profileResult.rows[0];

  // Fetch tags
  const tagsQuery = `
    SELECT t.id, t.name
    FROM tags t
    JOIN user_tags ut ON t.id = ut.tag_id
    WHERE ut.user_id = $1
    ORDER BY t.name ASC
  `;
  const tagsResult = await clientOrPool.query(tagsQuery, [userId]);
  const tags = tagsResult.rows;

  // Fetch photos
  const photosQuery = `
    SELECT id, url, is_profile_picture, created_at
    FROM photos
    WHERE user_id = $1
    ORDER BY is_profile_picture DESC, created_at ASC
  `;
  const photosResult = await clientOrPool.query(photosQuery, [userId]);
  const photos = photosResult.rows;

  const profileComplete = calculateProfileComplete(row, tags, photos);
  const lastSeen = row.last_seen ? new Date(row.last_seen) : null;

  return {
    id: row.user_id,
    username: row.username,
    firstName: row.first_name || "",
    lastName: row.last_name || "",
    gender: row.gender,
    sexualPreference: row.sexual_preference || "everyone",
    bio: row.biography || "",
    fameRating: Number(row.fame_rating) || 0,
    tags: tags.map(tag => ({ id: tag.id, name: tag.name })),
    pictures: toPictures(photos),
    isOnline: lastSeen ? Date.now() - lastSeen.getTime() < ONLINE_WINDOW_MS : false,
    lastSeen: lastSeen ? lastSeen.toISOString() : null,
    email: row.email,
    dateOfBirth: toDateOnly(row.birth_date),
    location: toLocation(row),
    profileComplete,
  };
};

/**
 * GET /api/profile/me
 * Fetch the authenticated user's profile data
 */
export const getMyProfile = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const profile = await fetchFullProfile(pool, userId);

    if (!profile) {
      return res.status(404).json(apiError(ERROR_CODES.PROFILE_NOT_FOUND, 'User profile not found'));
    }

    res.status(200).json(apiSuccess(profile));
  } catch (error) {
    next(error);
  }
};

/**
 * PATCH /api/profile/me
 * Update gender, sexual preference, biography, basic identity fields, and tags
 */
export const updateMyProfile = async (req, res, next) => {
  const client = await pool.connect();
  try {
    const userId = req.user.id;
    const {
      firstName,
      first_name,
      lastName,
      last_name,
      gender,
      sexualPreference,
      sexual_preference,
      biography,
      bio,
      dateOfBirth,
      date_of_birth,
      tagIds
    } = req.body;

    const newFirstName = firstName !== undefined ? firstName : first_name;
    const newLastName = lastName !== undefined ? lastName : last_name;
    const newGender = gender;
    const newSexualPreference = sexualPreference !== undefined ? sexualPreference : sexual_preference;
    const newBiography = biography !== undefined ? biography : bio;
    const newDateOfBirth = dateOfBirth !== undefined ? dateOfBirth : date_of_birth;
    const newTagIds = tagIds;

    // Field validations
    if (newFirstName !== undefined && (typeof newFirstName !== 'string' || newFirstName.trim().length === 0 || newFirstName.length > 50)) {
      return res.status(400).json(apiError(ERROR_CODES.VALIDATION_ERROR, 'First name must be between 1 and 50 characters'));
    }
    if (newLastName !== undefined && (typeof newLastName !== 'string' || newLastName.trim().length === 0 || newLastName.length > 50)) {
      return res.status(400).json(apiError(ERROR_CODES.VALIDATION_ERROR, 'Last name must be between 1 and 50 characters'));
    }
    if (newGender !== undefined && newGender !== null) {
      const normalizedGender = typeof newGender === 'string' ? newGender.trim().toLowerCase() : '';
      if (!VALID_GENDERS.includes(normalizedGender)) {
        return res.status(400).json(apiError(ERROR_CODES.VALIDATION_ERROR, `Gender must be one of: ${VALID_GENDERS.join(', ')}`));
      }
    }
    if (newSexualPreference !== undefined && newSexualPreference !== null) {
      const normalizedPref = typeof newSexualPreference === 'string' ? newSexualPreference.trim().toLowerCase() : '';
      if (!VALID_SEXUAL_PREFERENCES.includes(normalizedPref)) {
        return res.status(400).json(apiError(ERROR_CODES.VALIDATION_ERROR, `Sexual preference must be one of: ${VALID_SEXUAL_PREFERENCES.join(', ')}`));
      }
    }
    if (newBiography !== undefined && newBiography !== null) {
      if (typeof newBiography !== 'string' || newBiography.length > 1000) {
        return res.status(400).json(apiError(ERROR_CODES.VALIDATION_ERROR, 'Biography must not exceed 1000 characters'));
      }
    }
    if (newDateOfBirth !== undefined && newDateOfBirth !== null && newDateOfBirth !== '') {
      const validFormat = /^\d{4}-\d{2}-\d{2}$/.test(String(newDateOfBirth));
      const parsed = new Date(`${newDateOfBirth}T00:00:00Z`);
      let age = null;
      if (validFormat && !Number.isNaN(parsed.getTime())) {
        const now = new Date();
        const birth = new Date(`${newDateOfBirth}T00:00:00Z`);
        age = now.getUTCFullYear() - birth.getUTCFullYear() - Number(now.getUTCMonth() < birth.getUTCMonth() || (now.getUTCMonth() === birth.getUTCMonth() && now.getUTCDate() < birth.getUTCDate()));
      }
      if (age === null || age < 18 || age > 120) {
        return res.status(400).json(apiError(ERROR_CODES.VALIDATION_ERROR, 'Birth date must be a valid date for an age between 18 and 120'));
      }
    }
    if (newTagIds !== undefined) {
      const invalidTagIds = !Array.isArray(newTagIds) || newTagIds.length > 10 || new Set(newTagIds).size !== newTagIds.length ||
        newTagIds.some(id => typeof id !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id));
      if (invalidTagIds) {
        return res.status(400).json(apiError(ERROR_CODES.VALIDATION_ERROR, 'tagIds must be up to 10 distinct tag UUIDs'));
      }
    }

    await client.query('BEGIN');

    // Ensure profile row exists
    const checkProfileQuery = 'SELECT id FROM profiles WHERE user_id = $1';
    const checkProfileResult = await client.query(checkProfileQuery, [userId]);
    if (checkProfileResult.rows.length === 0) {
      await client.query(
        'INSERT INTO profiles (user_id, created_at, updated_at) VALUES ($1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)',
        [userId]
      );
    }

    // Build dynamic update for profile fields
    const updates = [];
    const values = [];
    let paramIndex = 1;

    if (newFirstName !== undefined) {
      updates.push(`first_name = $${paramIndex++}`);
      values.push(newFirstName.trim());
    }
    if (newLastName !== undefined) {
      updates.push(`last_name = $${paramIndex++}`);
      values.push(newLastName.trim());
    }
    if (newGender !== undefined) {
      updates.push(`gender = $${paramIndex++}`);
      values.push(newGender !== null ? newGender.trim().toLowerCase() : null);
    }
    if (newSexualPreference !== undefined) {
      updates.push(`sexual_preference = $${paramIndex++}`);
      values.push(newSexualPreference !== null ? newSexualPreference.trim().toLowerCase() : DEFAULT_SEXUAL_PREFERENCE);
    }
    if (newBiography !== undefined) {
      updates.push(`biography = $${paramIndex++}`);
      values.push(newBiography !== null ? newBiography.trim() : null);
    }
    if (newDateOfBirth !== undefined) {
      updates.push(`birth_date = $${paramIndex++}`);
      values.push(newDateOfBirth === null || newDateOfBirth === '' ? null : newDateOfBirth);
    }

    if (updates.length > 0) {
      updates.push(`updated_at = CURRENT_TIMESTAMP`);
      values.push(userId);
      const updateQuery = `
        UPDATE profiles 
        SET ${updates.join(', ')} 
        WHERE user_id = $${paramIndex}
      `;
      await client.query(updateQuery, values);
    }

    // Tag synchronization flow — replace the user's tags with the provided tag IDs.
    if (newTagIds !== undefined) {
      await client.query('DELETE FROM user_tags WHERE user_id = $1', [userId]);
      for (const tagId of newTagIds) {
        await client.query(
          'INSERT INTO user_tags (user_id, tag_id) VALUES ($1, $2) ON CONFLICT (user_id, tag_id) DO NOTHING',
          [userId, tagId]
        );
      }
    }

    await client.query('COMMIT');

    // Fetch and return the fresh profile
    const updatedProfile = await fetchFullProfile(pool, userId);

    res.status(200).json(apiSuccess(updatedProfile));
  } catch (error) {
    await client.query('ROLLBACK');
    next(error);
  } finally {
    client.release();
  }
};

/**
 * GET /api/tags
 * Returns all available tags, with optional search query filtering
 */
export const getAllTags = async (req, res, next) => {
  try {
    const { search } = req.query;
    let query = 'SELECT id, name, created_at FROM tags';
    const values = [];

    if (search && typeof search === 'string' && search.trim().length > 0) {
      query += ' WHERE name ILIKE $1 ORDER BY name ASC LIMIT 50';
      values.push(`%${search.trim().toLowerCase()}%`);
    } else {
      query += ' ORDER BY name ASC LIMIT 100';
    }

    const result = await pool.query(query, values);

    res.status(200).json(apiSuccess(result.rows.map(tag => ({ id: tag.id, name: tag.name }))));
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/profile/pictures
 * Securely uploads a profile photo (max 5 photos per user).
 * Automatically marks as profile picture if it is the user's first photo.
 */
export const uploadPhoto = async (req, res, next) => {
  try {
    const userId = req.user.id;

    if (!req.file || !req.file.buffer) {
      return res.status(400).json(apiError(ERROR_CODES.VALIDATION_ERROR, 'No image file uploaded'));
    }

    // Business rule: Enforce maximum 5 photos
    const countResult = await pool.query(
      'SELECT COUNT(*)::int AS count FROM photos WHERE user_id = $1',
      [userId]
    );
    const photoCount = countResult.rows[0].count;

    if (photoCount >= 5) {
      return res.status(400).json(apiError(ERROR_CODES.UPLOAD_LIMIT_REACHED, 'A user can have a maximum of 5 photos. Please delete a photo before uploading a new one.'));
    }

    // Decode, resize, and convert to WebP using Sharp.
    // Verify the actual decoded format so a renamed non-image cannot bypass checks.
    let processedBuffer;
    try {
      const metadata = await sharp(req.file.buffer).metadata();
      if (!['jpeg', 'png', 'webp'].includes(metadata.format)) {
        return res.status(400).json(apiError(ERROR_CODES.UPLOAD_INVALID_TYPE, 'Invalid image format.'));
      }
      processedBuffer = await sharp(req.file.buffer)
        .resize({ width: 1200, height: 1200, fit: 'inside', withoutEnlargement: true })
        .toFormat('webp', { quality: 85 })
        .toBuffer();
    } catch (sharpErr) {
      return res.status(400).json(apiError(ERROR_CODES.UPLOAD_INVALID_TYPE, 'Failed to process image. File may be corrupted or not a valid image format.'));
    }

    // Ensure uploads directory exists
    await fs.promises.mkdir(UPLOADS_DIR, { recursive: true });

    // Generate safe unique filename
    const uniqueFilename = `photo-${crypto.randomUUID()}-${Date.now()}.webp`;
    const targetFilePath = path.join(UPLOADS_DIR, uniqueFilename);

    await fs.promises.writeFile(targetFilePath, processedBuffer);

    // If first photo (or no existing profile photo marked), set as primary profile picture
    const checkPrimary = await pool.query(
      'SELECT id FROM photos WHERE user_id = $1 AND is_profile_picture = true',
      [userId]
    );
    const isProfilePicture = photoCount === 0 || checkPrimary.rows.length === 0;

    const photoUrl = `/uploads/${uniqueFilename}`;

    const insertResult = await pool.query(
      `INSERT INTO photos (user_id, url, is_profile_picture)
       VALUES ($1, $2, $3)
       RETURNING id, user_id, url, is_profile_picture, created_at`,
      [userId, photoUrl, isProfilePicture]
    );

    const uploadedPhoto = insertResult.rows[0];

    // Fetch updated profile to provide the fresh profileComplete status
    const updatedProfile = await fetchFullProfile(pool, userId);

    res.status(201).json(apiSuccess({ pictures: updatedProfile.pictures }));
  } catch (error) {
    next(error);
  }
};

/**
 * DELETE /api/profile/pictures/:pictureId
 * Deletes a user's photo. If the deleted photo was the primary profile picture,
 * automatically promotes the oldest remaining photo.
 */
export const deletePhoto = async (req, res, next) => {
  const client = await pool.connect();
  try {
    const userId = req.user.id;
    const { id } = req.params;

    // Verify ownership
    const photoResult = await client.query(
      'SELECT id, url, is_profile_picture FROM photos WHERE id = $1 AND user_id = $2',
      [id, userId]
    );

    if (photoResult.rows.length === 0) {
      return res.status(404).json(apiError(ERROR_CODES.NOT_FOUND, 'Photo not found or you are not authorized to delete it'));
    }

    const photo = photoResult.rows[0];

    // Remove file from disk
    const filename = path.basename(photo.url);
    const diskPath = path.join(UPLOADS_DIR, filename);
    try {
      await fs.promises.unlink(diskPath);
    } catch (err) {
      // File already missing from disk is not a fatal error
    }

    await client.query('BEGIN');

    await client.query('DELETE FROM photos WHERE id = $1', [id]);

    // If deleted photo was primary, promote remaining photo if any exists
    if (photo.is_profile_picture) {
      const remainingResult = await client.query(
        'SELECT id FROM photos WHERE user_id = $1 ORDER BY created_at ASC LIMIT 1',
        [userId]
      );
      if (remainingResult.rows.length > 0) {
        await client.query(
          'UPDATE photos SET is_profile_picture = true WHERE id = $1',
          [remainingResult.rows[0].id]
        );
      }
    }

    await client.query('COMMIT');

    const updatedProfile = await fetchFullProfile(pool, userId);

    res.status(200).json(apiSuccess({ pictures: updatedProfile.pictures }));
  } catch (error) {
    await client.query('ROLLBACK');
    next(error);
  } finally {
    client.release();
  }
};

/**
 * PATCH /api/profile/pictures/:pictureId/main
 * Set a specific photo as the primary profile picture
 */
export const setProfilePicture = async (req, res, next) => {
  const client = await pool.connect();
  try {
    const userId = req.user.id;
    const { id } = req.params;

    // Verify ownership
    const checkPhoto = await client.query(
      'SELECT id FROM photos WHERE id = $1 AND user_id = $2',
      [id, userId]
    );

    if (checkPhoto.rows.length === 0) {
      return res.status(404).json(apiError(ERROR_CODES.NOT_FOUND, 'Photo not found or you are not authorized to modify it'));
    }

    await client.query('BEGIN');

    // Unset current profile pictures
    await client.query(
      'UPDATE photos SET is_profile_picture = false WHERE user_id = $1',
      [userId]
    );

    // Set new profile picture
    const updateResult = await client.query(
      `UPDATE photos 
       SET is_profile_picture = true 
       WHERE id = $1 AND user_id = $2
       RETURNING id, user_id, url, is_profile_picture, created_at`,
      [id, userId]
    );

    await client.query('COMMIT');

    const updatedProfile = await fetchFullProfile(pool, userId);

    res.status(200).json(apiSuccess({ pictures: updatedProfile.pictures }));
  } catch (error) {
    await client.query('ROLLBACK');
    next(error);
  } finally {
    client.release();
  }
};
