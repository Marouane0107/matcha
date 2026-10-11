import { pool } from '../config/db.js';
import sharp from 'sharp';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const UPLOADS_DIR = path.resolve(__dirname, '../../uploads');

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
      p.id AS profile_id,
      p.first_name,
      p.last_name,
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

  return {
    userId: row.user_id,
    username: row.username,
    email: row.email,
    profileId: row.profile_id,
    firstName: row.first_name,
    lastName: row.last_name,
    gender: row.gender,
    sexualPreference: row.sexual_preference,
    biography: row.biography,
    fameRating: row.fame_rating || 0.0,
    latitude: row.latitude,
    longitude: row.longitude,
    locationString: row.location_string,
    tags,
    photos,
    profileComplete,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
};

/**
 * GET /api/profiles/me
 * Fetch the authenticated user's profile data
 */
export const getMyProfile = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const profile = await fetchFullProfile(pool, userId);

    if (!profile) {
      return res.status(404).json({
        status: 'error',
        message: 'User profile not found'
      });
    }

    res.status(200).json({
      status: 'success',
      data: { profile }
    });
  } catch (error) {
    next(error);
  }
};

/**
 * PATCH /api/profiles/me
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
      tags
    } = req.body;

    const newFirstName = firstName !== undefined ? firstName : first_name;
    const newLastName = lastName !== undefined ? lastName : last_name;
    const newGender = gender;
    const newSexualPreference = sexualPreference !== undefined ? sexualPreference : sexual_preference;
    const newBiography = biography !== undefined ? biography : bio;

    // Field validations
    if (newFirstName !== undefined && (typeof newFirstName !== 'string' || newFirstName.trim().length === 0 || newFirstName.length > 50)) {
      return res.status(400).json({ status: 'error', message: 'First name must be between 1 and 50 characters' });
    }
    if (newLastName !== undefined && (typeof newLastName !== 'string' || newLastName.trim().length === 0 || newLastName.length > 50)) {
      return res.status(400).json({ status: 'error', message: 'Last name must be between 1 and 50 characters' });
    }
    if (newGender !== undefined && newGender !== null) {
      if (typeof newGender !== 'string' || newGender.trim().length === 0 || newGender.length > 20) {
        return res.status(400).json({ status: 'error', message: 'Gender must be a valid string up to 20 characters' });
      }
    }
    if (newSexualPreference !== undefined && newSexualPreference !== null) {
      if (typeof newSexualPreference !== 'string' || newSexualPreference.trim().length === 0 || newSexualPreference.length > 20) {
        return res.status(400).json({ status: 'error', message: 'Sexual preference must be a valid string up to 20 characters' });
      }
    }
    if (newBiography !== undefined && newBiography !== null) {
      if (typeof newBiography !== 'string' || newBiography.length > 1000) {
        return res.status(400).json({ status: 'error', message: 'Biography must not exceed 1000 characters' });
      }
    }
    if (tags !== undefined && !Array.isArray(tags)) {
      return res.status(400).json({ status: 'error', message: 'Tags must be an array of tag names' });
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
      values.push(newSexualPreference !== null ? newSexualPreference.trim().toLowerCase() : 'bisexual');
    }
    if (newBiography !== undefined) {
      updates.push(`biography = $${paramIndex++}`);
      values.push(newBiography !== null ? newBiography.trim() : null);
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

    // Tag synchronization flow
    if (tags !== undefined) {
      // Sanitize and deduplicate tag names
      const tagMap = new Map();
      for (const rawTag of tags) {
        const rawName = typeof rawTag === 'string' ? rawTag : rawTag?.name;
        if (!rawName || typeof rawName !== 'string') continue;
        const cleaned = rawName.trim().replace(/^#+/, '').toLowerCase();
        // Validation: 2-30 characters alphanumeric, dashes, underscores
        if (/^[a-z0-9_-]{2,30}$/.test(cleaned)) {
          tagMap.set(cleaned, true);
        }
      }

      const sanitizedTagNames = Array.from(tagMap.keys()).slice(0, 20); // max 20 tags
      const tagIds = [];

      for (const tagName of sanitizedTagNames) {
        const tagResult = await client.query(
          `INSERT INTO tags (name) 
           VALUES ($1) 
           ON CONFLICT (name) DO UPDATE SET name = EXCLUDED.name 
           RETURNING id`,
          [tagName]
        );
        tagIds.push(tagResult.rows[0].id);
      }

      if (tagIds.length === 0) {
        // Clear all user tags if empty list provided
        await client.query('DELETE FROM user_tags WHERE user_id = $1', [userId]);
      } else {
        // Delete tags not present in new list
        await client.query(
          'DELETE FROM user_tags WHERE user_id = $1 AND NOT (tag_id = ANY($2::uuid[]))',
          [userId, tagIds]
        );
        // Insert missing associations
        for (const tagId of tagIds) {
          await client.query(
            'INSERT INTO user_tags (user_id, tag_id) VALUES ($1, $2) ON CONFLICT (user_id, tag_id) DO NOTHING',
            [userId, tagId]
          );
        }
      }
    }

    await client.query('COMMIT');

    // Fetch and return the fresh profile
    const updatedProfile = await fetchFullProfile(pool, userId);

    res.status(200).json({
      status: 'success',
      data: {
        message: 'Profile updated successfully',
        profile: updatedProfile
      }
    });
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

    res.status(200).json({
      status: 'success',
      data: {
        tags: result.rows
      }
    });
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/profiles/me/photos
 * Securely uploads a profile photo (max 5 photos per user).
 * Automatically marks as profile picture if it is the user's first photo.
 */
export const uploadPhoto = async (req, res, next) => {
  try {
    const userId = req.user.id;

    if (!req.file || !req.file.buffer) {
      return res.status(400).json({
        status: 'error',
        message: 'No image file uploaded'
      });
    }

    // Business rule: Enforce maximum 5 photos
    const countResult = await pool.query(
      'SELECT COUNT(*)::int AS count FROM photos WHERE user_id = $1',
      [userId]
    );
    const photoCount = countResult.rows[0].count;

    if (photoCount >= 5) {
      return res.status(400).json({
        status: 'error',
        message: 'A user can have a maximum of 5 photos. Please delete a photo before uploading a new one.'
      });
    }

    // Decode, resize, and convert to WebP using Sharp
    let processedBuffer;
    try {
      processedBuffer = await sharp(req.file.buffer)
        .resize({ width: 1200, height: 1200, fit: 'inside', withoutEnlargement: true })
        .toFormat('webp', { quality: 85 })
        .toBuffer();
    } catch (sharpErr) {
      return res.status(400).json({
        status: 'error',
        message: 'Failed to process image. File may be corrupted or not a valid image format.'
      });
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

    res.status(201).json({
      status: 'success',
      data: {
        message: 'Photo uploaded successfully',
        photo: uploadedPhoto,
        profile: updatedProfile
      }
    });
  } catch (error) {
    next(error);
  }
};

/**
 * DELETE /api/profiles/me/photos/:id
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
      return res.status(404).json({
        status: 'error',
        message: 'Photo not found or you are not authorized to delete it'
      });
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

    res.status(200).json({
      status: 'success',
      data: {
        message: 'Photo deleted successfully',
        profile: updatedProfile
      }
    });
  } catch (error) {
    await client.query('ROLLBACK');
    next(error);
  } finally {
    client.release();
  }
};

/**
 * PATCH /api/profiles/me/photos/:id/profile-picture
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
      return res.status(404).json({
        status: 'error',
        message: 'Photo not found or you are not authorized to modify it'
      });
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

    res.status(200).json({
      status: 'success',
      data: {
        message: 'Profile picture updated successfully',
        photo: updateResult.rows[0],
        profile: updatedProfile
      }
    });
  } catch (error) {
    await client.query('ROLLBACK');
    next(error);
  } finally {
    client.release();
  }
};

