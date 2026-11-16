import crypto from 'node:crypto';
import { pool } from '../config/db.js';
import { transaction } from './profile.js';
import { fields, email, fail } from '../utils/http.util.js';
import { verifyPassword } from '../utils/password.util.js';
import { sendEmailChange, sendEmailChangeCompleted } from '../utils/email.util.js';
import { invalidate, disconnectSessions } from './session.js';
import { consumeToken } from './tokens.js';

export async function changeEmail(id, body) {
  fields(body, ['newEmail', 'password'], ['newEmail', 'password']);
  if (!email(body.newEmail) || typeof body.password !== 'string') fail();
  const token = crypto.randomBytes(32).toString('hex');
  await transaction(async client => {
    const user = (await client.query('SELECT * FROM users WHERE id=$1 FOR UPDATE', [id])).rows[0];
    if (!await verifyPassword(body.password, user.password_hash)) fail('INVALID_CURRENT_PASSWORD', 403);
    if (user.email.toLowerCase() === body.newEmail.toLowerCase()) fail();
    if ((await client.query('SELECT id FROM users WHERE lower(email)=lower($1)', [body.newEmail])).rowCount) fail('EMAIL_ALREADY_EXISTS', 409);
    await client.query('DELETE FROM tokens WHERE user_id=$1 AND type=$2', [id, 'email_change']);
    await client.query('INSERT INTO tokens(user_id,token_hash,type,expires_at,pending_email) VALUES($1,$2,$3,NOW()+INTERVAL \'24 hours\',$4)', [id, crypto.createHash('sha256').update(token).digest('hex'), 'email_change', body.newEmail.toLowerCase()]);
  });
  await sendEmailChange(body.newEmail, token);
  return { message: 'Check your new email to confirm the change.' };
}
export async function verifyEmailChange(body) {
  fields(body, ['token'], ['token']);
  if (typeof body.token !== 'string' || !/^[a-f\d]{64}$/i.test(body.token)) fail('INVALID_EMAIL_CHANGE_TOKEN', 400);
  const result = await transaction(async client => {
    const token = await consumeToken(client, crypto.createHash('sha256').update(body.token).digest('hex'), 'email_change');
    if (!token) {
      await client.query('DELETE FROM tokens WHERE token_hash=$1 AND type=$2 AND expires_at<=NOW()', [crypto.createHash('sha256').update(body.token).digest('hex'), 'email_change']);
      return { invalid: true };
    }
    const oldEmail = (await client.query('SELECT email FROM users WHERE id=$1', [token.user_id])).rows[0].email;
    if ((await client.query('SELECT id FROM users WHERE lower(email)=lower($1)', [token.pending_email])).rowCount) return { conflict: true };
    await client.query('SAVEPOINT email_address_change');
    try {
      await client.query('UPDATE users SET email=$2 WHERE id=$1', [token.user_id, token.pending_email]);
    } catch (error) {
      if (error.code !== '23505') throw error;
      await client.query('ROLLBACK TO SAVEPOINT email_address_change');
      return { conflict: true };
    }
    await client.query('RELEASE SAVEPOINT email_address_change');
    await client.query('DELETE FROM tokens WHERE user_id=$1', [token.user_id]);
    await invalidate(token.user_id, client);
    return { id: token.user_id, oldEmail };
  });
  if (result.invalid) fail('INVALID_EMAIL_CHANGE_TOKEN', 400);
  if (result.conflict) fail('EMAIL_ALREADY_EXISTS', 409);
  disconnectSessions(result.id);
  try { await sendEmailChangeCompleted(result.oldEmail); }
  catch { console.error('Email-change completion notice delivery failed'); }
  return { message: 'Email changed. Sign in again.' };
}