import { pool } from '../config/db.js';
import crypto from 'crypto';
import { hashPassword, isPasswordStrong, isCommonPassword, verifyPassword } from '../utils/password.util.js';
import { sendVerificationEmail, sendPasswordResetEmail } from '../utils/email.util.js';
import { generateToken, getExpiresInSeconds } from '../utils/jwt.util.js';
import { apiSuccess, apiError, ERROR_CODES } from '../config/shared.js';
import { email as validEmail, text, fields, fail } from '../utils/http.util.js';
import { invalidate, disconnectSessions } from '../services/session.js';
import { profile as ownerProfile } from '../services/profile.js';
import { issueToken, consumeToken } from '../services/tokens.js';

function passwordPolicy(password) {
  if (!isPasswordStrong(password)) fail();
  if (isCommonPassword(password)) fail('PASSWORD_TOO_COMMON');
}

export const register = async (req, res, next) => {
  const client = await pool.connect();
  try {
    fields(req.body, ['username', 'email', 'firstName', 'lastName', 'password'], ['username', 'email', 'firstName', 'lastName', 'password']);
    const { username, email, firstName, lastName, password } = req.body;
    if (typeof username !== 'string' || !/^[a-z][a-z0-9_]{2,29}$/.test(username) || ['me', 'search', 'suggestions', 'auth', 'api'].includes(username) || !validEmail(email) || !text(firstName, 1, 50) || !text(lastName, 1, 50)) fail();
    passwordPolicy(password);
    await client.query('BEGIN');

    if (!username || !email || !firstName || !lastName || !password) {
      return res.status(400).json(apiError(ERROR_CODES.VALIDATION_ERROR, 'All fields are required'));
    }

    if (!isPasswordStrong(password)) {
      return res.status(400).json(apiError(ERROR_CODES.VALIDATION_ERROR, 'Password is too weak. Must be at least 8 characters with uppercase, lowercase, number, and special character.'));
    }

    // Check for existing email or username separately to return specific error codes
    const emailCheck = await client.query('SELECT id FROM users WHERE lower(email) = lower($1)', [email]);
    if (emailCheck.rows.length > 0) {
      return res.status(409).json(apiError(ERROR_CODES.EMAIL_ALREADY_EXISTS, 'Email already exists'));
    }

    const usernameCheck = await client.query('SELECT id FROM users WHERE username = $1', [username]);
    if (usernameCheck.rows.length > 0) {
      return res.status(409).json(apiError(ERROR_CODES.USERNAME_ALREADY_EXISTS, 'Username already exists'));
    }

    const hashedPwd = await hashPassword(password);

    // Insert user
    const insertUserQuery = `
      INSERT INTO users (username, email, password_hash)
      VALUES ($1, $2, $3) RETURNING id, username, email
    `;
    const userResult = await client.query(insertUserQuery, [username, email.toLowerCase(), hashedPwd]);
    const user = userResult.rows[0];

    // Insert profile
    const insertProfileQuery = `
      INSERT INTO profiles (user_id, first_name, last_name)
      VALUES ($1, $2, $3)
    `;
    await client.query(insertProfileQuery, [user.id, firstName, lastName]);

    // Generate verify token
    const rawToken = crypto.randomBytes(32).toString('hex');
    const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours from now

    const insertTokenQuery = `
      INSERT INTO tokens (user_id, token_hash, type, expires_at)
      VALUES ($1, $2, $3, $4)
    `;
    await client.query(insertTokenQuery, [user.id, tokenHash, 'verification', expiresAt]);
    await client.query('COMMIT');

    // Send email (ignoring errors if SMTP fails during development)
    try {
      await sendVerificationEmail(email, rawToken);
    } catch (emailError) {
      throw Object.assign(new Error('Email delivery failed; request another verification email.'), { statusCode: 503 });
    }

    res.status(201).json(apiSuccess({
      message: 'Registration successful. Please check your email to verify your account.',
      user: { id: user.id, username: user.username, email: user.email }
    }));
  } catch (error) {
    await client.query('ROLLBACK');
    if (error.code === '23505') { error.statusCode = 409; error.errorCode = error.constraint?.includes('username') ? 'USERNAME_ALREADY_EXISTS' : 'EMAIL_ALREADY_EXISTS'; }
    next(error);
  } finally { await client.query('ROLLBACK'); client.release(); }
};

export const verifyEmail = async (req, res, next) => {
  const client = await pool.connect();
  try {
    fields(req.body, ['token'], ['token']);
    const { token } = req.body;
    if (typeof token !== 'string' || !/^[a-f\d]{64}$/i.test(token)) {
      return res.status(400).json(apiError(ERROR_CODES.VALIDATION_ERROR, 'Token is required'));
    }

    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');

    await client.query('BEGIN');
    const tokenRecord = await consumeToken(client, tokenHash, 'verification');
    if (!tokenRecord) {
      return res.status(400).json(apiError(ERROR_CODES.INVALID_VERIFICATION_TOKEN, 'Invalid or expired token'));
    }

    // Verify the user account
    await client.query('UPDATE users SET is_verified = TRUE WHERE id = $1', [tokenRecord.user_id]);

    // Consume the token
    await client.query('COMMIT');

    res.status(200).json(apiSuccess({ message: 'Account verified successfully' }));
  } catch (error) {
    next(error);
  } finally { await client.query('ROLLBACK'); client.release(); }
};

export const login = async (req, res, next) => {
  try {
    fields(req.body, ['username', 'password'], ['username', 'password']);
    const { username, password } = req.body;
    if (typeof username !== 'string' || typeof password !== 'string' || password.length > 512) fail();

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
    const completion = await ownerProfile(user.id);
    const profileComplete = 'profileComplete' in completion && completion.profileComplete;

    const accessToken = generateToken({ id: user.id, version: user.token_version });
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
    await invalidate(req.user.id);
    disconnectSessions(req.user.id);
    res.status(204).end();
  } catch (error) {
    next(error);
  }
};

export const forgotPassword = async (req, res, next) => {
  try {
    fields(req.body, ['email'], ['email']);
    const { email } = req.body;
    if (!validEmail(email)) fail();
    if (!email) {
      return res.status(400).json(apiError(ERROR_CODES.VALIDATION_ERROR, 'Email is required'));
    }

    // Always respond with success to prevent email enumeration
    const successMsg = apiSuccess({
      message: 'If an account exists with this email, a password reset link has been sent.'
    });

    const rawToken = await issueToken(email, 'reset', 30 * 60 * 1000);
    if (!rawToken) {
      return res.status(200).json(successMsg);
    }

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
  const client = await pool.connect();
  try {
    fields(req.body, ['token', 'password'], ['token', 'password']);
    const { token, password } = req.body;
    if (typeof token !== 'string' || !/^[a-f\d]{64}$/i.test(token)) fail('INVALID_RESET_TOKEN', 400);
    passwordPolicy(password);

    if (!token || !password) {
      return res.status(400).json(apiError(ERROR_CODES.VALIDATION_ERROR, 'Token and password are required'));
    }

    if (!isPasswordStrong(password)) {
      return res.status(400).json(apiError(ERROR_CODES.VALIDATION_ERROR, 'Password is too weak'));
    }

    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    await client.query('BEGIN');
    const tokenRecord = await consumeToken(client, tokenHash, 'reset');
    if (!tokenRecord) {
      return res.status(400).json(apiError(ERROR_CODES.INVALID_RESET_TOKEN, 'Invalid or expired reset token'));
    }

    const hashedPwd = await hashPassword(password);

    // Update password
    await client.query('UPDATE users SET password_hash = $1 WHERE id = $2', [hashedPwd, tokenRecord.user_id]);
    await invalidate(tokenRecord.user_id, client);

    // Invalidate token
    await client.query('DELETE FROM tokens WHERE user_id = $1 AND type = ANY($2::text[])', [tokenRecord.user_id, ['reset', 'email_change']]);
    await client.query('COMMIT');
    disconnectSessions(tokenRecord.user_id);

    res.status(200).json(apiSuccess({ message: 'Password has been reset successfully' }));
  } catch (error) {
    next(error);
  } finally { await client.query('ROLLBACK'); client.release(); }
};

export const resendVerification = async (req, res, next) => {
  try {
    fields(req.body, ['email'], ['email']);
    const { email } = req.body;
    if (!validEmail(email)) fail();
    if (!email) {
      return res.status(400).json(apiError(ERROR_CODES.VALIDATION_ERROR, 'Email is required'));
    }

    // Always respond with success to prevent email enumeration
    const successMsg = apiSuccess({
      message: 'If an unverified account exists with this email, a new verification link has been sent.'
    });

    const rawToken = await issueToken(email, 'verification', 24 * 60 * 60 * 1000, true);
    if (!rawToken) {
      return res.status(200).json(successMsg);
    }

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
    const completion = await ownerProfile(userId);
    const profileComplete = 'profileComplete' in completion && completion.profileComplete;

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
