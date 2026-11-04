import { pool } from '../config/db.js';
import crypto from 'crypto';
import { hashPassword, isPasswordStrong, verifyPassword } from '../utils/password.util.js';
import { sendVerificationEmail, sendPasswordResetEmail } from '../utils/email.util.js';
import { generateToken, getExpiresInSeconds } from '../utils/jwt.util.js';
import { apiSuccess, apiError, ERROR_CODES } from '../config/shared.js';

export const register = async (req, res, next) => {
  try {
    const { username, email, firstName, lastName, password } = req.body;

    if (!username || !email || !firstName || !lastName || !password) {
      return res.status(400).json(apiError(ERROR_CODES.VALIDATION_ERROR, 'All fields are required'));
    }

    if (!isPasswordStrong(password)) {
      return res.status(400).json(apiError(ERROR_CODES.VALIDATION_ERROR, 'Password is too weak. Must be at least 8 characters with uppercase, lowercase, number, and special character.'));
    }

    // Check for existing email or username separately to return specific error codes
    const emailCheck = await pool.query('SELECT id FROM users WHERE email = $1', [email]);
    if (emailCheck.rows.length > 0) {
      return res.status(409).json(apiError(ERROR_CODES.EMAIL_ALREADY_EXISTS, 'Email already exists'));
    }

    const usernameCheck = await pool.query('SELECT id FROM users WHERE username = $1', [username]);
    if (usernameCheck.rows.length > 0) {
      return res.status(409).json(apiError(ERROR_CODES.USERNAME_ALREADY_EXISTS, 'Username already exists'));
    }

    const hashedPwd = await hashPassword(password);

    // Insert user
    const insertUserQuery = `
      INSERT INTO users (username, email, password_hash)
      VALUES ($1, $2, $3) RETURNING id, username, email
    `;
    const userResult = await pool.query(insertUserQuery, [username, email, hashedPwd]);
    const user = userResult.rows[0];

    // Insert profile
    const insertProfileQuery = `
      INSERT INTO profiles (user_id, first_name, last_name)
      VALUES ($1, $2, $3)
    `;
    await pool.query(insertProfileQuery, [user.id, firstName, lastName]);

    // Generate verify token
    const rawToken = crypto.randomBytes(32).toString('hex');
    const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours from now

    const insertTokenQuery = `
      INSERT INTO tokens (user_id, token_hash, type, expires_at)
      VALUES ($1, $2, $3, $4)
    `;
    await pool.query(insertTokenQuery, [user.id, tokenHash, 'verification', expiresAt]);

    // Send email (ignoring errors if SMTP fails during development)
    try {
      await sendVerificationEmail(email, rawToken);
    } catch (emailError) {
      console.error('Failed to send verification email:', emailError);
    }

    res.status(201).json(apiSuccess({
      message: 'Registration successful. Please check your email to verify your account.',
      user: { id: user.id, username: user.username, email: user.email }
    }));
  } catch (error) {
    next(error);
  }
};

export const verifyEmail = async (req, res, next) => {
  try {
    const { token } = req.body;
    if (!token) {
      return res.status(400).json(apiError(ERROR_CODES.VALIDATION_ERROR, 'Token is required'));
    }

    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');

    const tokenQuery = 'SELECT * FROM tokens WHERE token_hash = $1 AND type = $2';
    const tokenResult = await pool.query(tokenQuery, [tokenHash, 'verification']);

    if (tokenResult.rows.length === 0) {
      return res.status(400).json(apiError(ERROR_CODES.INVALID_VERIFICATION_TOKEN, 'Invalid or expired token'));
    }

    const tokenRecord = tokenResult.rows[0];

    if (new Date() > new Date(tokenRecord.expires_at)) {
      await pool.query('DELETE FROM tokens WHERE id = $1', [tokenRecord.id]);
      return res.status(400).json(apiError(ERROR_CODES.INVALID_VERIFICATION_TOKEN, 'Token has expired'));
    }

    // Verify the user account
    await pool.query('UPDATE users SET is_verified = TRUE WHERE id = $1', [tokenRecord.user_id]);

    // Consume the token
    await pool.query('DELETE FROM tokens WHERE id = $1', [tokenRecord.id]);

    res.status(200).json(apiSuccess({ message: 'Account verified successfully' }));
  } catch (error) {
    next(error);
  }
};

export const login = async (req, res, next) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json(apiError(ERROR_CODES.VALIDATION_ERROR, 'Username and password are required'));
    }

    const query = 'SELECT * FROM users WHERE username = $1';
    const result = await pool.query(query, [username]);

    if (result.rows.length === 0) {
      return res.status(401).json(apiError(ERROR_CODES.INVALID_CREDENTIALS, 'Invalid credentials'));
    }

    const user = result.rows[0];

    const isMatch = await verifyPassword(password, user.password_hash);
    if (!isMatch) {
      return res.status(401).json(apiError(ERROR_CODES.INVALID_CREDENTIALS, 'Invalid credentials'));
    }

    if (!user.is_verified) {
      return res.status(403).json(apiError(ERROR_CODES.EMAIL_NOT_VERIFIED, 'Please verify your email before logging in'));
    }

    // Fetch profile to determine profileComplete
    const profileResult = await pool.query(
      `SELECT p.first_name, p.last_name, p.gender, p.biography
       FROM profiles p WHERE p.user_id = $1`,
      [user.id]
    );
    const profile = profileResult.rows[0];
    const profileComplete = Boolean(profile?.gender && profile?.biography);

    const accessToken = generateToken({ id: user.id });
    const expiresIn = getExpiresInSeconds();

    res.status(200).json(apiSuccess({
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        firstName: profile?.first_name || '',
        lastName: profile?.last_name || '',
        emailVerified: user.is_verified,
        profileComplete,
      },
      accessToken,
      tokenType: 'Bearer',
      expiresIn,
    }));
  } catch (error) {
    next(error);
  }
};

export const logout = async (req, res, next) => {
  try {
    res.status(200).json(apiSuccess({ message: 'Logged out successfully' }));
  } catch (error) {
    next(error);
  }
};

export const forgotPassword = async (req, res, next) => {
  try {
    const { email } = req.body;
    if (!email) {
      return res.status(400).json(apiError(ERROR_CODES.VALIDATION_ERROR, 'Email is required'));
    }

    // Always respond with success to prevent email enumeration
    const successMsg = apiSuccess({
      message: 'If an account exists with this email, a password reset link has been sent.'
    });

    const userResult = await pool.query('SELECT id FROM users WHERE email = $1', [email]);
    if (userResult.rows.length === 0) {
      return res.status(200).json(successMsg);
    }

    const userId = userResult.rows[0].id;

    // Delete any existing unused reset tokens for this user
    await pool.query('DELETE FROM tokens WHERE user_id = $1 AND type = $2', [userId, 'reset']);

    const rawToken = crypto.randomBytes(32).toString('hex');
    const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

    await pool.query(
      'INSERT INTO tokens (user_id, token_hash, type, expires_at) VALUES ($1, $2, $3, $4)',
      [userId, tokenHash, 'reset', expiresAt]
    );

    try {
      await sendPasswordResetEmail(email, rawToken);
    } catch (error) {
      console.error('Failed to send reset email:', error);
    }

    res.status(200).json(successMsg);
  } catch (error) {
    next(error);
  }
};

export const resetPassword = async (req, res, next) => {
  try {
    const { token, password } = req.body;

    if (!token || !password) {
      return res.status(400).json(apiError(ERROR_CODES.VALIDATION_ERROR, 'Token and password are required'));
    }

    if (!isPasswordStrong(password)) {
      return res.status(400).json(apiError(ERROR_CODES.VALIDATION_ERROR, 'Password is too weak'));
    }

    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    const tokenResult = await pool.query('SELECT * FROM tokens WHERE token_hash = $1 AND type = $2', [tokenHash, 'reset']);

    if (tokenResult.rows.length === 0) {
      return res.status(400).json(apiError(ERROR_CODES.INVALID_RESET_TOKEN, 'Invalid or expired reset token'));
    }

    const tokenRecord = tokenResult.rows[0];

    if (new Date() > new Date(tokenRecord.expires_at)) {
      await pool.query('DELETE FROM tokens WHERE id = $1', [tokenRecord.id]);
      return res.status(400).json(apiError(ERROR_CODES.INVALID_RESET_TOKEN, 'Reset token has expired'));
    }

    const hashedPwd = await hashPassword(password);

    // Update password
    await pool.query('UPDATE users SET password_hash = $1 WHERE id = $2', [hashedPwd, tokenRecord.user_id]);

    // Invalidate token
    await pool.query('DELETE FROM tokens WHERE id = $1', [tokenRecord.id]);

    res.status(200).json(apiSuccess({ message: 'Password has been reset successfully' }));
  } catch (error) {
    next(error);
  }
};

export const resendVerification = async (req, res, next) => {
  try {
    const { email } = req.body;
    if (!email) {
      return res.status(400).json(apiError(ERROR_CODES.VALIDATION_ERROR, 'Email is required'));
    }

    // Always respond with success to prevent email enumeration
    const successMsg = apiSuccess({
      message: 'If an unverified account exists with this email, a new verification link has been sent.'
    });

    const userResult = await pool.query('SELECT id, is_verified FROM users WHERE email = $1', [email]);
    if (userResult.rows.length === 0 || userResult.rows[0].is_verified) {
      return res.status(200).json(successMsg);
    }

    const userId = userResult.rows[0].id;

    // Delete any existing verification tokens for this user
    await pool.query('DELETE FROM tokens WHERE user_id = $1 AND type = $2', [userId, 'verification']);

    const rawToken = crypto.randomBytes(32).toString('hex');
    const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

    await pool.query(
      'INSERT INTO tokens (user_id, token_hash, type, expires_at) VALUES ($1, $2, $3, $4)',
      [userId, tokenHash, 'verification', expiresAt]
    );

    try {
      await sendVerificationEmail(email, rawToken);
    } catch (emailError) {
      console.error('Failed to resend verification email:', emailError);
    }

    res.status(200).json(successMsg);
  } catch (error) {
    next(error);
  }
};

export const getMe = async (req, res, next) => {
  try {
    const userId = req.user.id;

    const query = `
      SELECT u.id, u.username, u.email, u.is_verified, 
             p.first_name, p.last_name, p.gender, p.biography
      FROM users u
      LEFT JOIN profiles p ON u.id = p.user_id
      WHERE u.id = $1
    `;

    const result = await pool.query(query, [userId]);

    if (result.rows.length === 0) {
      return res.status(404).json(apiError(ERROR_CODES.NOT_FOUND, 'User not found'));
    }

    const user = result.rows[0];

    // Determine if profile is complete based on basic criteria
    const profileComplete = Boolean(user.gender && user.biography);

    res.status(200).json(apiSuccess({
      id: user.id,
      username: user.username,
      email: user.email,
      firstName: user.first_name || '',
      lastName: user.last_name || '',
      emailVerified: user.is_verified,
      profileComplete,
    }));
  } catch (error) {
    next(error);
  }
};
