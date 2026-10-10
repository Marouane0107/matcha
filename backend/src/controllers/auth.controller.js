import { pool } from '../config/db.js';
import crypto from 'crypto';
import { hashPassword, isPasswordStrong, verifyPassword } from '../utils/password.util.js';
import { sendVerificationEmail, sendPasswordResetEmail } from '../utils/email.util.js';
import { generateToken } from '../utils/jwt.util.js';

export const register = async (req, res, next) => {
  try {
    const { username, email, firstName, lastName, password } = req.body;
    
    if (!username || !email || !firstName || !lastName || !password) {
      return res.status(400).json({ status: 'error', message: 'All fields are required' });
    }
    
    if (!isPasswordStrong(password)) {
      return res.status(400).json({ status: 'error', message: 'Password is too weak' });
    }

    const checkQuery = 'SELECT id FROM users WHERE email = $1 OR username = $2';
    const checkResult = await pool.query(checkQuery, [email, username]);
    if (checkResult.rows.length > 0) {
      return res.status(409).json({ status: 'error', message: 'Email or username already exists' });
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

    // Send email (ignoring errors if SMTP fails during development, but it shouldn't crash registration ideally)
    try {
      await sendVerificationEmail(email, rawToken);
    } catch (emailError) {
      console.error('Failed to send verification email:', emailError);
    }

    res.status(201).json({
      status: 'success',
      data: {
        message: 'Registration successful. Please check your email to verify your account.',
        user: { id: user.id, username: user.username, email: user.email }
      }
    });
  } catch (error) {
    next(error);
  }
};

export const verify = async (req, res, next) => {
  try {
    const { token } = req.query;
    if (!token) return res.status(400).json({ status: 'error', message: 'Token is required' });

    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    
    const tokenQuery = 'SELECT * FROM tokens WHERE token_hash = $1 AND type = $2';
    const tokenResult = await pool.query(tokenQuery, [tokenHash, 'verification']);
    
    if (tokenResult.rows.length === 0) {
      return res.status(400).json({ status: 'error', message: 'Invalid or expired token' });
    }

    const tokenRecord = tokenResult.rows[0];
    
    if (new Date() > new Date(tokenRecord.expires_at)) {
      await pool.query('DELETE FROM tokens WHERE id = $1', [tokenRecord.id]);
      return res.status(400).json({ status: 'error', message: 'Token has expired' });
    }

    // Verify the user account
    await pool.query('UPDATE users SET is_verified = TRUE WHERE id = $1', [tokenRecord.user_id]);
    
    // Consume the token
    await pool.query('DELETE FROM tokens WHERE id = $1', [tokenRecord.id]);

    res.status(200).json({ status: 'success', data: { message: 'Account verified successfully' } });
  } catch (error) {
    next(error);
  }
};

export const login = async (req, res, next) => {
  try {
    const { email, password } = req.body;
    
    if (!email || !password) {
      return res.status(400).json({ status: 'error', message: 'Email and password are required' });
    }

    const query = 'SELECT * FROM users WHERE email = $1';
    const result = await pool.query(query, [email]);
    
    if (result.rows.length === 0) {
      return res.status(401).json({ status: 'error', message: 'Invalid credentials' });
    }

    const user = result.rows[0];

    const isMatch = await verifyPassword(password, user.password_hash);
    if (!isMatch) {
      return res.status(401).json({ status: 'error', message: 'Invalid credentials' });
    }

    if (!user.is_verified) {
      return res.status(403).json({ status: 'error', message: 'Please verify your email before logging in' });
    }

    const token = generateToken({ id: user.id });

    res.status(200).json({
      status: 'success',
      data: {
        user: {
          id: user.id,
          username: user.username,
          email: user.email
        },
        token
      }
    });
  } catch (error) {
    next(error);
  }
};

export const logout = async (req, res, next) => {
  try {
    res.status(200).json({
      status: 'success',
      data: {
        message: 'Logged out successfully'
      }
    });
  } catch (error) {
    next(error);
  }
};

export const forgotPassword = async (req, res, next) => {
  try {
    const { email } = req.body;
    if (!email) {
      return res.status(400).json({ status: 'error', message: 'Email is required' });
    }

    // Always respond with success to prevent email enumeration
    const successResponse = {
      status: 'success',
      data: { message: 'If an account exists with this email, a password reset link has been sent.' }
    };

    const userResult = await pool.query('SELECT id FROM users WHERE email = $1', [email]);
    if (userResult.rows.length === 0) {
      return res.status(200).json(successResponse);
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

    res.status(200).json(successResponse);
  } catch (error) {
    next(error);
  }
};

export const resetPassword = async (req, res, next) => {
  try {
    const { token, newPassword } = req.body;

    if (!token || !newPassword) {
      return res.status(400).json({ status: 'error', message: 'Token and new password are required' });
    }

    if (!isPasswordStrong(newPassword)) {
      return res.status(400).json({ status: 'error', message: 'Password is too weak' });
    }

    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    const tokenResult = await pool.query('SELECT * FROM tokens WHERE token_hash = $1 AND type = $2', [tokenHash, 'reset']);

    if (tokenResult.rows.length === 0) {
      return res.status(400).json({ status: 'error', message: 'Invalid or expired reset token' });
    }

    const tokenRecord = tokenResult.rows[0];

    if (new Date() > new Date(tokenRecord.expires_at)) {
      await pool.query('DELETE FROM tokens WHERE id = $1', [tokenRecord.id]);
      return res.status(400).json({ status: 'error', message: 'Reset token has expired' });
    }

    const hashedPwd = await hashPassword(newPassword);

    // Update password
    await pool.query('UPDATE users SET password_hash = $1 WHERE id = $2', [hashedPwd, tokenRecord.user_id]);
    
    // Invalidate token
    await pool.query('DELETE FROM tokens WHERE id = $1', [tokenRecord.id]);

    res.status(200).json({ status: 'success', data: { message: 'Password has been reset successfully' } });
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
      return res.status(404).json({ status: 'error', message: 'User not found' });
    }

    const user = result.rows[0];

    // Determine if profile is complete based on basic criteria (e.g. gender and bio set)
    const isProfileComplete = Boolean(user.gender && user.biography);

    res.status(200).json({
      status: 'success',
      data: {
        user: {
          id: user.id,
          username: user.username,
          email: user.email,
          firstName: user.first_name,
          lastName: user.last_name,
          isVerified: user.is_verified,
        },
        isProfileComplete
      }
    });
  } catch (error) {
    next(error);
  }
};
