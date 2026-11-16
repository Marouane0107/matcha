import crypto from 'node:crypto';
import { transaction } from './profile.js';

export async function issueToken(address, type, lifetime, unverifiedOnly = false) {
  return transaction(async client => {
    const user = (await client.query('SELECT id FROM users WHERE lower(email)=lower($1) AND ($2=false OR NOT is_verified) FOR UPDATE', [address, unverifiedOnly])).rows[0];
    if (!user) return null;
    const raw = crypto.randomBytes(32).toString('hex');
    await client.query('DELETE FROM tokens WHERE user_id=$1 AND type=$2', [user.id, type]);
    await client.query('INSERT INTO tokens(user_id,token_hash,type,expires_at) VALUES($1,$2,$3,$4)', [user.id, crypto.createHash('sha256').update(raw).digest('hex'), type, new Date(Date.now() + lifetime)]);
    return raw;
  });
}

export async function consumeToken(client, hash, type) {
  const token = (await client.query('SELECT user_id FROM tokens WHERE token_hash=$1 AND type=$2 AND expires_at>NOW()', [hash, type])).rows[0];
  if (!token) return null;
  await client.query('SELECT id FROM users WHERE id=$1 FOR UPDATE', [token.user_id]);
  return (await client.query('DELETE FROM tokens WHERE token_hash=$1 AND type=$2 AND expires_at>NOW() RETURNING *', [hash, type])).rows[0] ?? null;
}